using AiUiBuilder.Api.Models;
using AiUiBuilder.Api.Services;

using System.Text.Json;
using System.Text.Json.Serialization;

var builder = WebApplication.CreateBuilder(args);

builder.Services.ConfigureHttpJsonOptions(options =>
{
    options.SerializerOptions.PropertyNamingPolicy = JsonNamingPolicy.CamelCase;
    options.SerializerOptions.DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull;
});
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();
builder.Services.AddHttpClient();
builder.Services.AddSingleton<ProjectStore>();
builder.Services.AddSingleton<AgentService>();
builder.Services.AddSingleton<DemoStore>();
builder.Services.AddCors(options =>
{
    options.AddPolicy("frontend", policy =>
        policy.WithOrigins(
                "http://localhost:5173",
                "http://127.0.0.1:5173",
                "http://localhost:4173")
            .AllowAnyHeader()
            .AllowAnyMethod());
});

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseCors("frontend");

var uploadsRoot = Path.Combine(app.Environment.ContentRootPath, "uploads");
Directory.CreateDirectory(uploadsRoot);
app.UseStaticFiles(new StaticFileOptions
{
    FileProvider = new Microsoft.Extensions.FileProviders.PhysicalFileProvider(uploadsRoot),
    RequestPath = "/uploads"
});

app.MapGet("/api/health", () => Results.Ok(new { status = "ok", service = "AiUiBuilder" }));

app.MapGet("/api/projects", (ProjectStore store) => Results.Ok(store.List()));

app.MapPost("/api/projects", (ProjectStore store) =>
{
    var project = store.Create();
    return Results.Created($"/api/projects/{project.Id}", project);
});

app.MapGet("/api/projects/{id}", (string id, ProjectStore store) =>
{
    var project = store.Get(id);
    return project is null ? Results.NotFound() : Results.Ok(project);
});

app.MapGet("/api/share/{id}", (string id, ProjectStore store) =>
{
    var project = store.Get(id);
    if (project is null) return Results.NotFound(new { error = "الرابط غير موجود أو السيرفر إعادة تشغيل" });
    return Results.Ok(new
    {
        project.Id,
        project.Name,
        project.Page,
        project.Workspaces,
        project.ActiveWorkspaceId,
        shared = true
    });
});

app.MapPost("/api/chat", async (ChatRequest request, ProjectStore store, AgentService agent, CancellationToken ct) =>
{
    var project = !string.IsNullOrWhiteSpace(request.ProjectId)
        ? store.Get(request.ProjectId!)
        : null;

    project ??= store.Create();

    // Resolve workspace: explicit id → hint in message → active
    var hinted = store.FindWorkspaceByHint(project, request.Message);
    var wsId = request.WorkspaceId
               ?? hinted?.Id
               ?? project.ActiveWorkspaceId;
    project = store.SetActive(project.Id, wsId, request.PageId) ?? project;
    var ws = project.ActiveWorkspace();
    var current = request.CurrentPage
                  ?? ws.Pages.FirstOrDefault(p => p.Id == ws.ActivePageId)
                  ?? ws.Pages[0];

    var result = await agent.GenerateAsync(request.Message, current, ws.Messages, ct);

    var messages = ws.Messages
        .Append(new ChatMessage("user", request.Message, DateTime.UtcNow))
        .Append(new ChatMessage("assistant", result.Reply, DateTime.UtcNow))
        .ToList();

    List<UiPage> pages;
    string activePageId;
    if (result.ExtraPages is { Count: > 0 })
    {
        // Multi-page flow: keep other unrelated pages, replace/add flow pages
        var map = ws.Pages.ToDictionary(p => p.Id);
        map[result.Page.Id] = result.Page;
        foreach (var extra in result.ExtraPages)
            map[extra.Id] = extra;
        pages = map.Values.ToList();
        // Prefer putting login first if both present
        pages = pages
            .OrderBy(p => p.Title.Contains("دخول") || p.Id.Contains("login") ? 0 : 1)
            .ThenBy(p => p.Title)
            .ToList();
        activePageId = result.FocusPageId ?? result.Page.Id;
    }
    else
    {
        pages = ws.Pages.Select(p => p.Id == result.Page.Id ? result.Page : p).ToList();
        if (pages.All(p => p.Id != result.Page.Id))
            pages.Add(result.Page);
        activePageId = result.FocusPageId ?? result.Page.Id;
    }

    project = store.ReplaceWorkspacePages(project.Id, ws.Id, pages, activePageId, messages) ?? project;

    return Results.Ok(new ChatResponse(
        project.Id,
        result.Reply,
        project.Page,
        messages,
        project));
});

app.MapPut("/api/projects/{id}/page", (string id, UpdatePageRequest body, ProjectStore store) =>
{
    var project = store.UpdateActivePage(id, body.Page, body.WorkspaceId);
    return project is null ? Results.NotFound() : Results.Ok(project);
});

app.MapPut("/api/projects/{id}/theme", (string id, UpdateThemeRequest body, ProjectStore store) =>
{
    var project = store.Get(id);
    if (project is null) return Results.NotFound();
    var wsId = body.WorkspaceId ?? project.ActiveWorkspaceId;
    var ws = project.Workspaces.FirstOrDefault(w => w.Id == wsId) ?? project.Workspaces[0];
    var pageId = body.PageId ?? ws.ActivePageId;
    var pages = ws.Pages.Select(p =>
        p.Id == pageId ? p with { Theme = body.Theme } : p).ToList();
    project = store.ReplaceWorkspacePages(id, ws.Id, pages, pageId, ws.Messages);
    return project is null ? Results.NotFound() : Results.Ok(project);
});

app.MapPost("/api/projects/{id}/workspaces", (string id, CreateWorkspaceRequest? body, ProjectStore store) =>
{
    var project = store.AddWorkspace(id, body?.Name);
    return project is null ? Results.NotFound() : Results.Ok(project);
});

app.MapPut("/api/projects/{id}/workspaces/{wsId}", (string id, string wsId, RenameWorkspaceRequest body, ProjectStore store) =>
{
    if (string.IsNullOrWhiteSpace(body.Name)) return Results.BadRequest(new { error = "الاسم مطلوب" });
    var project = store.RenameWorkspace(id, wsId, body.Name);
    return project is null ? Results.NotFound() : Results.Ok(project);
});

app.MapDelete("/api/projects/{id}/workspaces/{wsId}", (string id, string wsId, ProjectStore store) =>
{
    var project = store.DeleteWorkspace(id, wsId);
    return project is null
        ? Results.BadRequest(new { error = "لازم يضل وورك سبيس واحد على الأقل" })
        : Results.Ok(project);
});

app.MapPut("/api/projects/{id}/workspaces/{wsId}/pages/{pageId}", (string id, string wsId, string pageId, RenamePageRequest body, ProjectStore store) =>
{
    if (string.IsNullOrWhiteSpace(body.Title)) return Results.BadRequest(new { error = "الاسم مطلوب" });
    var project = store.RenamePage(id, wsId, pageId, body.Title);
    return project is null ? Results.NotFound() : Results.Ok(project);
});

app.MapPut("/api/projects/{id}/workspaces/{wsId}/page-order", (string id, string wsId, ReorderPagesRequest body, ProjectStore store) =>
{
    if (body.PageIds is null || body.PageIds.Count == 0)
        return Results.BadRequest(new { error = "ترتيب الصفحات مطلوب" });
    var project = store.ReorderPages(id, wsId, body.PageIds);
    return project is null ? Results.NotFound() : Results.Ok(project);
});

app.MapDelete("/api/projects/{id}/workspaces/{wsId}/pages/{pageId}", (string id, string wsId, string pageId, ProjectStore store) =>
{
    var project = store.DeletePage(id, wsId, pageId);
    return project is null
        ? Results.NotFound()
        : Results.Ok(project);
});

app.MapPut("/api/projects/{id}/active", (string id, SetActiveRequest body, ProjectStore store) =>
{
    var project = store.SetActive(id, body.WorkspaceId, body.PageId);
    return project is null ? Results.NotFound() : Results.Ok(project);
});

app.MapPost("/api/projects/{id}/pages", (string id, CreatePageRequest? body, ProjectStore store) =>
{
    var project = store.AddPage(id, body?.WorkspaceId, body?.Title);
    return project is null ? Results.NotFound() : Results.Ok(project);
});

app.MapPost("/api/uploads", async (HttpRequest req) =>
{
    if (!req.HasFormContentType)
        return Results.BadRequest(new { error = "multipart form required" });

    var form = await req.ReadFormAsync();
    var file = form.Files.GetFile("file") ?? form.Files.FirstOrDefault();
    if (file is null || file.Length == 0)
        return Results.BadRequest(new { error = "لا يوجد ملف" });

    var ext = Path.GetExtension(file.FileName);
    if (string.IsNullOrWhiteSpace(ext) || ext.Length > 8)
        ext = ".png";
    var allowed = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
        { ".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg" };
    if (!allowed.Contains(ext))
        return Results.BadRequest(new { error = "صيغة الصورة غير مدعومة" });

    var name = $"{Guid.NewGuid():N}{ext.ToLowerInvariant()}";
    var path = Path.Combine(uploadsRoot, name);
    await using (var stream = File.Create(path))
        await file.CopyToAsync(stream);

    var url = $"/uploads/{name}";
    return Results.Ok(new { url, name, size = file.Length });
});

app.MapGet("/api/components/catalog", () => Results.Ok(new[]
{
    new { type = "navbar", label = "شريط تنقل", description = "شعار + روابط + CTA" },
    new { type = "sidebar", label = "سايدبار منيو", description = "قائمة جانبية ثابتة" },
    new { type = "burgermenu", label = "بيرجر منيو", description = "قائمة همبرغر مع درج" },
    new { type = "hero", label = "هيرو", description = "عنوان رئيسي وزر" },
    new { type = "features", label = "مميزات", description = "شبكة مميزات" },
    new { type = "cards", label = "كروت", description = "بطاقات محتوى" },
    new { type = "stats", label = "إحصائيات", description = "أرقام سريعة" },
    new { type = "form", label = "نموذج", description = "نموذج تواصل" },
    new { type = "login", label = "تسجيل دخول", description = "نموذج لوجين" },
    new { type = "profile", label = "بروفايل", description = "ملف شخصي" },
    new { type = "feed", label = "فيد بوستات", description = "منشورات + لايك/كومنت/شير" },
    new { type = "cta", label = "دعوة لإجراء", description = "بانر CTA" },
    new { type = "footer", label = "فوتر", description = "تذييل الصفحة" },
    new { type = "text", label = "نص", description = "فقرة نصية" },
    new { type = "button", label = "زر", description = "زر مع أكشن" },
    new { type = "image", label = "صورة", description = "ارفع صورة من جهازك" },
    new { type = "stack", label = "ستاك/بطاقة", description = "زر + صورة + رابط بالترتيب" },
    new { type = "sections", label = "أقسام / ديف", description = "قسّم لعدد أجزاء — كل جزء نص/صورة/زر" },
    new { type = "search", label = "بحث", description = "سيرش تفاعلي ضد الـ API" },
    new { type = "select", label = "اختيار واحد", description = "Single select" },
    new { type = "multiselect", label = "اختيار متعدد", description = "Multi select" },
    new { type = "dropdown", label = "دروب داون", description = "قائمة منسدلة" },
    new { type = "usercard", label = "يوزر كارد", description = "بطاقة مستخدم" },
    new { type = "colorpicker", label = "Color picker", description = "اختيار لون" },
    new { type = "datepicker", label = "Date picker", description = "اختيار تاريخ" },
    new { type = "timepicker", label = "Time picker", description = "اختيار وقت" },
    new { type = "chart", label = "Chart", description = "رسم بياني من الـ API" }
}));

app.MapGet("/api/demo/users", (string? q, DemoStore demo) =>
    Results.Ok(new { query = q ?? "", results = demo.SearchUsers(q) }));

app.MapGet("/api/demo/users/{id}", (string id, DemoStore demo) =>
{
    var user = demo.GetUser(id);
    return user is null ? Results.NotFound() : Results.Ok(user);
});

app.MapGet("/api/demo/options", (string? q, DemoStore demo) =>
    Results.Ok(demo.Options(q)));

app.MapGet("/api/demo/stats", (DemoStore demo) => Results.Ok(demo.Stats()));

app.MapGet("/api/demo/chart", (DemoStore demo) => Results.Ok(demo.Chart()));

app.MapPost("/api/demo/select", (DemoSelectRequest body, DemoStore demo) =>
{
    var saved = demo.RecordSelection(body.Kind, new
    {
        body.Values,
        body.Label,
        body.ComponentId
    });
    return Results.Ok(new
    {
        ok = true,
        message = $"تم حفظ الاختيار ({body.Kind}) على السيرفر",
        saved,
        echo = body
    });
});

app.MapGet("/api/demo/events", (DemoStore demo) => Results.Ok(demo.RecentEvents()));

app.Run();

public record DemoSelectRequest(
    string Kind,
    string[] Values,
    string? Label = null,
    string? ComponentId = null
);
