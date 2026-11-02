using System.Collections.Concurrent;
using AiUiBuilder.Api.Models;

namespace AiUiBuilder.Api.Services;

public class ProjectStore
{
    private readonly ConcurrentDictionary<string, ProjectState> _projects = new();

    public static UiPage EmptyPage(string? id = null, string title = "صفحة جديدة") => new(
        Id: id ?? "page-1",
        Title: title,
        Description: "مساحة فارغة — احكي للشات أو أضف كمبوننت بإيدك",
        Theme: DefaultTheme.Light(),
        Components: []
    );

    public static Workspace EmptyWorkspace(string? name = null, int index = 1)
    {
        var page = EmptyPage();
        return new Workspace(
            Id: $"ws-{Guid.NewGuid().ToString("N")[..6]}",
            Name: name ?? $"وورك سبيس {index}",
            Pages: [page],
            ActivePageId: page.Id,
            Messages:
            [
                new ChatMessage(
                    "assistant",
                    "أهلاً! هاد الوورك سبيس فاضي. احكيلي شو بدك تبني هون (مثلاً لوجين + داشبورد)، أو أضيفي صورة/أقسام بإيدك. تقدري تسمّي الوورك سبيس وتضيفي غيره من شريط المشروع.",
                    DateTime.UtcNow)
            ]
        );
    }

    public ProjectState Create(string? name = null)
    {
        var id = Guid.NewGuid().ToString("N")[..10];
        var ws = EmptyWorkspace(index: 1);
        var project = new ProjectState(
            Id: id,
            Name: name ?? $"مشروع {id}",
            Workspaces: [ws],
            ActiveWorkspaceId: ws.Id,
            UpdatedAt: DateTime.UtcNow
        );
        _projects[id] = project;
        return project;
    }

    public ProjectState? Get(string id) =>
        _projects.TryGetValue(id, out var p) ? p : null;

    public ProjectState Upsert(ProjectState state)
    {
        var updated = state with { UpdatedAt = DateTime.UtcNow };
        _projects[state.Id] = updated;
        return updated;
    }

    public IReadOnlyList<ProjectState> List() =>
        _projects.Values.OrderByDescending(p => p.UpdatedAt).ToList();

    public ProjectState? AddWorkspace(string projectId, string? name)
    {
        var project = Get(projectId);
        if (project is null) return null;
        var ws = EmptyWorkspace(name, project.Workspaces.Count + 1);
        var list = project.Workspaces.Append(ws).ToList();
        return Upsert(project with
        {
            Workspaces = list,
            ActiveWorkspaceId = ws.Id
        });
    }

    public ProjectState? DeleteWorkspace(string projectId, string workspaceId)
    {
        var project = Get(projectId);
        if (project is null) return null;
        if (project.Workspaces.Count <= 1) return null;
        var list = project.Workspaces.Where(w => w.Id != workspaceId).ToList();
        if (list.Count == project.Workspaces.Count) return null;
        var active = project.ActiveWorkspaceId == workspaceId ? list[0].Id : project.ActiveWorkspaceId;
        return Upsert(project with { Workspaces = list, ActiveWorkspaceId = active });
    }

    public ProjectState? RenameWorkspace(string projectId, string workspaceId, string name)
    {
        var project = Get(projectId);
        if (project is null) return null;
        var list = project.Workspaces.Select(w =>
            w.Id == workspaceId ? w with { Name = name.Trim() } : w).ToList();
        return Upsert(project with { Workspaces = list });
    }

    public ProjectState? SetActive(string projectId, string? workspaceId, string? pageId)
    {
        var project = Get(projectId);
        if (project is null) return null;

        var wsId = workspaceId ?? project.ActiveWorkspaceId;
        var ws = project.Workspaces.FirstOrDefault(w => w.Id == wsId) ?? project.Workspaces[0];
        var activePage = pageId ?? ws.ActivePageId;
        if (ws.Pages.All(p => p.Id != activePage))
            activePage = ws.Pages[0].Id;

        var list = project.Workspaces.Select(w =>
            w.Id == ws.Id ? w with { ActivePageId = activePage } : w).ToList();

        return Upsert(project with
        {
            Workspaces = list,
            ActiveWorkspaceId = ws.Id
        });
    }

    public ProjectState? AddPage(string projectId, string? workspaceId, string? title)
    {
        var project = Get(projectId);
        if (project is null) return null;
        var wsId = workspaceId ?? project.ActiveWorkspaceId;
        var page = EmptyPage($"page-{Guid.NewGuid().ToString("N")[..6]}", title ?? $"صفحة {DateTime.UtcNow:HHmm}");
        var list = project.Workspaces.Select(w =>
        {
            if (w.Id != wsId) return w;
            return w with
            {
                Pages = w.Pages.Append(page).ToList(),
                ActivePageId = page.Id
            };
        }).ToList();
        return Upsert(project with { Workspaces = list, ActiveWorkspaceId = wsId });
    }

    public ProjectState? RenamePage(string projectId, string workspaceId, string pageId, string title)
    {
        var project = Get(projectId);
        if (project is null) return null;
        var trimmed = title.Trim();
        if (trimmed.Length == 0) return null;
        var list = project.Workspaces.Select(w =>
        {
            if (w.Id != workspaceId) return w;
            return w with
            {
                Pages = w.Pages.Select(p => p.Id == pageId ? p with { Title = trimmed } : p).ToList()
            };
        }).ToList();
        return Upsert(project with { Workspaces = list });
    }

    public ProjectState? ReorderPages(string projectId, string workspaceId, IReadOnlyList<string> pageIds)
    {
        var project = Get(projectId);
        if (project is null || pageIds.Count == 0) return null;
        var found = false;
        var list = project.Workspaces.Select(w =>
        {
            if (w.Id != workspaceId) return w;
            found = true;
            var byId = w.Pages.ToDictionary(p => p.Id);
            var ordered = new List<UiPage>();
            foreach (var id in pageIds)
            {
                if (byId.Remove(id, out var page))
                    ordered.Add(page);
            }
            ordered.AddRange(byId.Values);
            return w with { Pages = ordered };
        }).ToList();
        if (!found) return null;
        return Upsert(project with { Workspaces = list });
    }

    public ProjectState? DeletePage(string projectId, string workspaceId, string pageId)
    {
        var project = Get(projectId);
        if (project is null) return null;
        var changed = false;
        var list = project.Workspaces.Select(w =>
        {
            if (w.Id != workspaceId) return w;
            var existing = w.Pages.FirstOrDefault(p => p.Id == pageId);
            if (existing is null) return w;
            changed = true;
            if (w.Pages.Count <= 1)
            {
                var blank = EmptyPage($"page-{Guid.NewGuid().ToString("N")[..6]}") with { Theme = existing.Theme };
                return w with { Pages = new List<UiPage> { blank }, ActivePageId = blank.Id };
            }
            var pages = w.Pages.Where(p => p.Id != pageId).ToList();
            var active = w.ActivePageId == pageId ? pages[0].Id : w.ActivePageId;
            return w with { Pages = pages, ActivePageId = active };
        }).ToList();
        if (!changed) return null;
        return Upsert(project with { Workspaces = list, ActiveWorkspaceId = workspaceId });
    }

    public ProjectState? UpdateActivePage(string projectId, UiPage page, string? workspaceId = null)
    {
        var project = Get(projectId);
        if (project is null) return null;
        var wsId = workspaceId ?? project.ActiveWorkspaceId;
        var list = project.Workspaces.Select(w =>
        {
            if (w.Id != wsId) return w;
            var pages = w.Pages.Select(p => p.Id == page.Id ? page : p).ToList();
            if (pages.All(p => p.Id != page.Id))
                pages.Add(page);
            return w with { Pages = pages, ActivePageId = page.Id };
        }).ToList();
        return Upsert(project with { Workspaces = list, ActiveWorkspaceId = wsId });
    }

    public ProjectState? ReplaceWorkspacePages(
        string projectId,
        string workspaceId,
        IReadOnlyList<UiPage> pages,
        string activePageId,
        List<ChatMessage> messages)
    {
        var project = Get(projectId);
        if (project is null) return null;
        var list = project.Workspaces.Select(w =>
            w.Id == workspaceId
                ? w with { Pages = pages.ToList(), ActivePageId = activePageId, Messages = messages }
                : w).ToList();
        return Upsert(project with { Workspaces = list, ActiveWorkspaceId = workspaceId });
    }

    public Workspace? FindWorkspaceByHint(ProjectState project, string message)
    {
        var lower = message.ToLowerInvariant();
        // by name
        foreach (var w in project.Workspaces.OrderByDescending(x => x.Name.Length))
        {
            if (lower.Contains(w.Name.ToLowerInvariant()))
                return w;
        }

        // وورك سبيس 1 / workspace 2 / الأولى / الثانية
        var ordinals = new (string[] Words, int Index)[]
        {
            (["الاولى", "الأولى", "اولى", "أولى", "الأول", "الاول", "1", "one", "first"], 0),
            (["التانية", "الثانية", "تانية", "ثانية", "الثاني", "التاني", "2", "two", "second"], 1),
            (["التالتة", "الثالثة", "3", "three", "third"], 2),
        };

        if (ContainsAny(lower, "وورك", "workspace", "وركسبيس", "مساحة"))
        {
            foreach (var (words, idx) in ordinals)
            {
                if (words.Any(w => lower.Contains(w)) && idx < project.Workspaces.Count)
                    return project.Workspaces[idx];
            }
        }

        return null;
    }

    private static bool ContainsAny(string hay, params string[] needles) =>
        needles.Any(n => hay.Contains(n, StringComparison.OrdinalIgnoreCase));
}
