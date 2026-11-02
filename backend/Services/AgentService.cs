using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using AiUiBuilder.Api.Models;

namespace AiUiBuilder.Api.Services;

public class AgentService
{
    private readonly IConfiguration _config;
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly ILogger<AgentService> _logger;

    public AgentService(
        IConfiguration config,
        IHttpClientFactory httpClientFactory,
        ILogger<AgentService> logger)
    {
        _config = config;
        _httpClientFactory = httpClientFactory;
        _logger = logger;
    }

    public async Task<AgentResult> GenerateAsync(
        string message,
        UiPage? currentPage,
        IReadOnlyList<ChatMessage>? history = null,
        CancellationToken ct = default)
    {
        var apiKey = _config["OpenAI:ApiKey"];
        if (!string.IsNullOrWhiteSpace(apiKey))
        {
            try
            {
                var (reply, page) = await GenerateWithOpenAiAsync(message, currentPage, history, apiKey, ct);
                return new AgentResult(reply, page);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "OpenAI failed, falling back to local agent");
            }
        }

        return GenerateLocal(message, currentPage, history);
    }

    private async Task<(string Reply, UiPage Page)> GenerateWithOpenAiAsync(
        string message,
        UiPage? currentPage,
        IReadOnlyList<ChatMessage>? history,
        string apiKey,
        CancellationToken ct)
    {
        var model = _config["OpenAI:Model"] ?? "gpt-4o-mini";
        var client = _httpClientFactory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", apiKey);

        var system = """
            You are an AI UI builder that CONTINUES a conversation. Reply ONLY with valid JSON:
            {
              "reply": "short Arabic reply describing WHAT you added/changed on the EXISTING page",
              "page": { ...full page... }
            }
            DEFAULT BEHAVIOR: Merge into the current page. Keep existing components/ids/props the user already has unless the user explicitly asks to replace or start over.
            Only rebuild from scratch if the user says من الصفر / صفحة جديدة / start over.
            Add missing pieces (login, feed, profile, form...) when asked. Update theme/colors when asked.
            Component types: hero|navbar|features|cards|form|cta|footer|stats|text|button|login|profile|feed
            If the user describes a custom layout (button under image under link in a card), build a "stack" component with ordered items — do NOT replace with a generic landing page.
            Keep RTL Arabic copy.
            """;

        var currentJson = currentPage is null
            ? "null"
            : JsonSerializer.Serialize(currentPage, JsonOpts());

        var historyText = history is { Count: > 0 }
            ? string.Join("\n", history.TakeLast(8).Select(m => $"{m.Role}: {m.Content}"))
            : "(no prior messages)";

        var body = new
        {
            model,
            temperature = 0.4,
            response_format = new { type = "json_object" },
            messages = new object[]
            {
                new { role = "system", content = system },
                new { role = "user", content = $"Chat history:\n{historyText}\n\nCurrent page JSON:\n{currentJson}\n\nLatest user request:\n{message}" }
            }
        };

        using var content = new StringContent(JsonSerializer.Serialize(body), Encoding.UTF8, "application/json");
        using var response = await client.PostAsync("https://api.openai.com/v1/chat/completions", content, ct);
        response.EnsureSuccessStatusCode();
        await using var stream = await response.Content.ReadAsStreamAsync(ct);
        using var doc = await JsonDocument.ParseAsync(stream, cancellationToken: ct);
        var raw = doc.RootElement
            .GetProperty("choices")[0]
            .GetProperty("message")
            .GetProperty("content")
            .GetString() ?? "{}";

        using var parsed = JsonDocument.Parse(raw);
        var reply = parsed.RootElement.TryGetProperty("reply", out var r)
            ? r.GetString() ?? "تم تحديث الصفحة."
            : "تم تحديث الصفحة.";

        var pageEl = parsed.RootElement.GetProperty("page");
        var page = JsonSerializer.Deserialize<UiPage>(pageEl.GetRawText(), JsonOpts())
                   ?? GenerateLocal(message, currentPage, history).Page;

        return (reply, NormalizePage(page));
    }

    public AgentResult GenerateLocal(
        string message,
        UiPage? currentPage,
        IReadOnlyList<ChatMessage>? history = null)
    {
        var text = NormalizeUserText(message);
        var lower = text.ToLowerInvariant();
        var kind = DetectKind(lower);
        var hasExisting = currentPage?.Components is { Count: > 0 };
        var priorUserTurns = history?.Count(m =>
            string.Equals(m.Role, "user", StringComparison.OrdinalIgnoreCase)) ?? 0;
        var theme = ResolveTheme(currentPage?.Theme ?? DefaultTheme.Light(), lower, kind);
        var fresh = WantsFreshStart(lower);

        // Multi-page app flow inside same workspace (login → dashboard)
        if (LooksLikeMultiPageFlow(lower))
            return BuildMultiPageFlow(text, lower, theme, currentPage?.Id);

        // N sections / div grid: "ديف مقسمة لـ 3 أجزاء"
        if (LooksLikeSectionsLayout(lower))
        {
            var count = ExtractCount(lower, 3);
            var sections = MakeSections(count, lower);
            return new AgentResult(
                $"تمام — عملت ديف مقسومة لـ {count} أجزاء. بكل جزء اختاري نص / صورة / زر وعدّلي بإيدك.",
                new UiPage(
                    currentPage?.Id ?? "page-1",
                    $"أقسام ({count})",
                    Shorten(text, 140),
                    theme,
                    [
                        MakeNavbar("علامتي", new[] { "الرئيسية", "حول", "تواصل" }, "ابدأ"),
                        sections,
                        MakeFooter()
                    ]));
        }

        // Two-column / split page: "نصين/نصفين — الأول صورة والثاني لوجين"
        if (LooksLikeSplitLayout(lower))
        {
            var (title, components) = BuildSplit(text, lower);
            return new AgentResult(
                $"تمام — بنيت الصفحة نصّين بالزبط: {DescribeSplit(components)}. عدّليها بإيدك أو كمّلي الحكي.",
                new UiPage(currentPage?.Id ?? "page-1", title, Shorten(text, 140), theme, components));
        }

        // Navbar / interactive widgets first — never collapse into a custom stack card
        if (kind == PageKind.Interactive || LooksLikeNavbarCompose(lower))
        {
            var (title, components) = BuildInteractive(text, lower);
            var detail = LooksLikeNavbarCompose(lower)
                ? "شريط تنقل: سيرش + دروب داون عاليمين، ويوزر كارد عالشمال."
                : $"عناصر: {string.Join(" + ", components.Select(c => TypeArabic(c.Type)).Distinct())}.";
            return new AgentResult(
                $"جهّزت «{title}» — {detail} جرّبيه تفاعلياً (البحث/الاختيار بيرجع للـ API).",
                new UiPage(currentPage?.Id ?? "page-1", title, Shorten(text, 140), theme, components));
        }

        // Custom layouts must rebuild cleanly — never keep a wrong landing hero
        if (kind == PageKind.Custom || LooksLikeCustomLayout(lower))
        {
            var (title, components) = BuildCustom(text, lower);
            var page = new UiPage(
                Id: currentPage?.Id ?? "page-1",
                Title: title,
                Description: Shorten(text, 140),
                Theme: theme,
                Components: components
            );
            var items = components.FirstOrDefault(c => c.Type == "stack")?.Props.GetValueOrDefault("items");
            var order = DescribeStackOrder(items);
            return new AgentResult(
                $"تمام — بنيت بطاقة بالترتيب: {order}. (مش صفحة هبوط). عدّليها بإيدك أو كمّلي الحكي.",
                page);
        }

        if (kind == PageKind.ThemeOnly && hasExisting && priorUserTurns > 0 && currentPage is not null)
        {
            var themed = currentPage with { Theme = theme };
            return new AgentResult("كمّلت معك: حدّثت الثيم والألوان. قولي شو بعد؟", themed);
        }

        // Continue on the same page whenever it already has content (login/dashboard included)
        if (hasExisting && !fresh && priorUserTurns > 0 && currentPage is not null)
        {
            var (continued, changes) = ContinuePage(currentPage, text, lower, kind, theme);
            if (changes.Count > 0)
            {
                var reply =
                    $"كمّلت على نفس الصفحة حسب «{Shorten(text, 50)}»: {string.Join("، ", changes)}. " +
                    "الحكي لسا شغّال — قولي شو بعد، أو عدّلي بإيدك من الـ Space.";
                return new AgentResult(reply, continued);
            }

            // Additive asks (كروت / إحصائيات…) must never fall into a silent no-op
            if (LooksLikeAdditiveSection(lower))
            {
                var (forced, forcedChanges) = ForceAddSections(continued, text, lower, theme);
                if (forcedChanges.Count > 0)
                {
                    return new AgentResult(
                        $"كمّلت على نفس الصفحة حسب «{Shorten(text, 50)}»: {string.Join("، ", forcedChanges)}.",
                        forced);
                }
            }

            // Full-page rebuild only for clear page intents when continue found nothing
            var strongRebuild = kind is PageKind.Social or PageKind.Shop or PageKind.Blog
                                or PageKind.Portfolio or PageKind.Restaurant
                                || (kind is PageKind.Login or PageKind.Dashboard
                                    && ContainsAny(lower, "صفحة", "page", "اعمل", "اعملي", "ابني", "بني", "سوي", "من الصفر"));
            if (!strongRebuild)
            {
                return new AgentResult(
                    "فاهمك، بس ما لقيت شي جديد أضيفه. جرّبي: ضيف كروت / إحصائيات / مميزات / فورم / صورة / غيّر اللون للأزرق. أو «من الصفر».",
                    continued);
            }
        }

        var (builtTitle, builtComponents) = BuildPage(kind, text, lower, theme);
        var builtPage = new UiPage(
            Id: currentPage?.Id ?? "page-1",
            Title: builtTitle,
            Description: text.Length > 140 ? text[..140] + "…" : text,
            Theme: theme,
            Components: builtComponents
        );

        var built = BuildReply(text, builtTitle, kind, builtComponents);
        return new AgentResult(
            built + " كمّلي الحكي عادي عشان نزيد عليها، أو اضغطي قسم بالـ Space وعدّليه بإيدك.",
            builtPage);
    }

    private static bool LooksLikeMultiPageFlow(string lower)
    {
        var login = ContainsAny(lower, "login", "لوجين", "لوغين", "تسجيل دخول", "تسجيل الدخول", "صفحة دخول");
        var dash = ContainsAny(lower, "dashboard", "داشبورد", "دشبورد", "لوحة تحكم", "لوحة التحكم", "لوحة");
        var flow = ContainsAny(lower, "وراها", "بعدها", "وبعدين", "ثم", "بعد هيك", "وبعدها", "وبعدين صفحة", "صفحتين", "صفحات", "flow", "navigate");
        return (login && dash) || (login && flow) || (dash && flow && login);
    }

    private static bool LooksLikeAdditiveSection(string lower) =>
        ContainsAny(lower,
            "كروت", "cards", "بطاقات",
            "احصا", "إحصا", "stats", "أرقام",
            "مميزات", "features",
            "فورم", "form", "نموذج",
            "هيرو", "hero",
            "فوتر", "footer",
            "navbar", "نافبار", "شريط",
            "سايدبار", "sidebar", "side bar",
            "بيرجر", "burger", "همبرغر", "همبرجر", "hamburger",
            "اقسام", "أقسام", "ديف", "div", "sections", "grid", "أعمدة", "اعمدة",
            "صورة", "image",
            "cta", "دعوة",
            "ضيف", "أضف", "اضف", "زود", "زيد");

    private static int FooterInsertIndex(List<UiComponent> comps)
    {
        var footerIdx = comps.FindIndex(c => c.Type == "footer");
        return footerIdx >= 0 ? footerIdx : comps.Count;
    }

    private static int ExtractCount(string lower, int fallback)
    {
        var m = Regex.Match(lower, @"(?:عدد|count)\s*[=:]?\s*(\d+)");
        if (m.Success && int.TryParse(m.Groups[1].Value, out var n) && n is >= 1 and <= 12)
            return n;
        m = Regex.Match(lower, @"\b([1-9]|1[0-2])\b");
        if (m.Success && int.TryParse(m.Groups[1].Value, out n) && n is >= 1 and <= 12)
            return n;
        if (ContainsAny(lower, "اثنين", "ثنين", "زوج", "٢")) return 2;
        if (ContainsAny(lower, "ثلاث", "ثلاثة", "٣")) return 3;
        if (ContainsAny(lower, "اربع", "أربع", "٤")) return 4;
        return fallback;
    }

    private static (UiPage Page, List<string> Changes) ForceAddSections(
        UiPage page, string text, string lower, ThemeTokens theme)
    {
        var comps = page.Components.Select(c => c).ToList();
        var changes = new List<string>();
        var at = FooterInsertIndex(comps);

        void Add(string type, UiComponent created, string label)
        {
            if (comps.Any(c => c.Type == type) && !ContainsAny(lower, "كمان", "بعد", "زيادة", "عدد"))
                return;
            comps.Insert(Math.Min(at, comps.Count), created);
            at = FooterInsertIndex(comps);
            changes.Add($"أضفت {label}");
        }

        if (ContainsAny(lower, "كروت", "cards", "بطاقات"))
        {
            var count = ExtractCount(lower, 2);
            var items = Enumerable.Range(1, count)
                .Select(i => ($"بطاقة {i}", $"وصف مختصر للبطاقة {i}"))
                .ToArray();
            var existing = comps.FindIndex(c => c.Type == "cards");
            if (existing >= 0)
            {
                comps[existing] = MakeCards("كروت", items);
                changes.Add($"حدّثت الكروت إلى {count}");
            }
            else Add("cards", MakeCards("كروت", items), $"كروت ({count})");
        }

        if (ContainsAny(lower, "احصا", "إحصا", "stats", "أرقام"))
            Add("stats", MakeStats(), "إحصائيات");
        if (ContainsAny(lower, "مميزات", "features"))
            Add("features", MakeFeatures(), "مميزات");
        if (ContainsAny(lower, "فورم", "form", "نموذج"))
            Add("form", MakeForm(), "نموذج");
        if (ContainsAny(lower, "هيرو", "hero"))
            Add("hero", MakeHero("عنوان رئيسي", "وصف قصير.", "ابدأ", "New"), "هيرو");
        if (ContainsAny(lower, "سايدبار", "sidebar", "side bar"))
            Add("sidebar", MakeSidebar(), "سايدبار منيو");
        if (ContainsAny(lower, "بيرجر", "burger", "همبرغر", "همبرجر", "hamburger"))
            Add("burgermenu", MakeBurgerMenu(), "بيرجر منيو");
        if (LooksLikeSectionsLayout(lower) || ContainsAny(lower, "اقسام", "أقسام", "ديف", "sections", "grid"))
        {
            var count = ExtractCount(lower, 3);
            var existing = comps.FindIndex(c => c.Type == "sections");
            if (existing >= 0)
            {
                comps[existing] = MakeSections(count, lower);
                changes.Add($"حدّثت الأقسام إلى {count}");
            }
            else
                Add("sections", MakeSections(count, lower), $"أقسام ({count})");
        }

        return (page with { Theme = theme, Components = comps }, changes);
    }

    private static bool LooksLikeSectionsLayout(string lower)
    {
        var sectionWords = ContainsAny(lower,
            "اقسام", "أقسام", "ديف", "div", "sections", "grid", "أعمدة", "اعمدة",
            "مقسمة", "مقسومة", "جزئين", "أجزاء", "اجزا", "أجزاء", "parts", "columns");
        var countHint = ContainsAny(lower, "عدد", "جزء", "اقسام", "أقسام") || Regex.IsMatch(lower, @"\b([2-9]|1[0-2])\b");
        // Prefer dedicated sections over 2-column login split
        if (ContainsAny(lower, "لوجين", "login", "فورم تسجيل") && ContainsAny(lower, "نصفين", "نصين", "عمودين"))
            return false;
        return sectionWords && (countHint || ContainsAny(lower, "ديف", "div", "sections", "grid", "أعمدة"));
    }

    private static AgentResult BuildMultiPageFlow(string text, string lower, ThemeTokens theme, string? keepLoginId)
    {
        var dashId = $"page-dash-{Guid.NewGuid().ToString("N")[..6]}";
        var loginId = string.IsNullOrWhiteSpace(keepLoginId) || keepLoginId!.StartsWith("page-dash")
            ? $"page-login-{Guid.NewGuid().ToString("N")[..6]}"
            : keepLoginId;

        var loginComps = new List<UiComponent>
        {
            MakeNavbar("حسابي", new[] { "دخول", "مساعدة" }, "إنشاء حساب"),
            MakeHero("سجّل دخولك", "بعد الدخول بتنفتح لوحة التحكم.", "متابعة", "Auth"),
            MakeLogin("تسجيل الدخول", "البريد الإلكتروني", true, navigateToPageId: dashId),
            MakeFooter("© Auth flow · Login → Dashboard")
        };

        var (_, dashComps) = BuildDashboard();
        // Ensure dashboard has a way back conceptually via navbar brand
        var loginPage = new UiPage(loginId, "تسجيل الدخول", Shorten(text, 140), theme, loginComps);
        var dashPage = new UiPage(dashId, "لوحة التحكم", "بعد تسجيل الدخول", theme, dashComps);

        return new AgentResult(
            "جهّزت تدفّق صفحات بنفس الوورك سبيس: «تسجيل الدخول» → «لوحة التحكم». زر الدخول بفتح الداشبورد. كمّلي الحكي على أي صفحة أو غيّر الصفحة من الشريط فوق.",
            loginPage,
            ExtraPages: [dashPage],
            FocusPageId: loginId);
    }

    private static string NormalizeUserText(string message)
    {
        var t = message.Trim();
        // Arabizi / common misspellings → Arabic keywords the detector knows
        var pairs = new (string From, string To)[]
        {
            ("يوزر كارد", "usercard"), ("user card", "usercard"), ("يوزركارد", "usercard"),
            ("دروب داون", "dropdown"), ("drop down", "dropdown"), ("دروبداون", "dropdown"),
            ("سيرش بوكس", "search"), ("search box", "search"), ("سيرشبوكس", "search"),
            ("شريط تنقل", "navbar"), ("ناف بار", "navbar"),
            ("لوح ان فورم", "لوجين فورم"), ("لوح ان", "لوجين"), ("login form", "لوجين فورم"),
            ("التنية", "الثانية"), ("التانية", "الثانية"), ("نصين بالزبط", "نصفين"), ("نصين", "نصفين"),
            ("بوتوم", "زر"), ("بوتم", "زر"), ("بتون", "زر"), ("بوتن", "زر"), ("bottom", "زر"), ("button", "زر"),
            ("لينك", "رابط"), ("link", "رابط"), ("url", "رابط"),
            // keep "يوزر بطاقة" out of generic card detection — user-card already mapped above
            ("كارد", "بطاقة"), ("card", "بطاقة"),
            ("img", "صورة"), ("pic", "صورة"), ("picture", "صورة"), ("image", "صورة"),
        };
        foreach (var (from, to) in pairs)
            t = Regex.Replace(t, from, to, RegexOptions.IgnoreCase);
        return t;
    }

    private static string DescribeStackOrder(object? items)
    {
        if (items is not IEnumerable<object> list)
            return "زر → صورة → رابط";
        var kinds = new List<string>();
        foreach (var item in list)
        {
            if (item is Dictionary<string, object?> dict && dict.TryGetValue("kind", out var k))
                kinds.Add(k?.ToString() switch
                {
                    "button" => "زر",
                    "image" => "صورة",
                    "link" => "رابط",
                    "text" => "نص",
                    _ => k?.ToString() ?? "?"
                });
        }
        return kinds.Count > 0 ? string.Join(" → ", kinds) : "زر → صورة → رابط";
    }

    private static bool WantsFreshStart(string lower) =>
        ContainsAny(lower,
            "من الصفر", "من اول", "من أول", "صفحة جديدة", "ابدأ من جديد", "ابدا من جديد",
            "ابدأ من الصفر", "start over", "from scratch", "new page", "rebuild")
        && !ContainsAny(lower, "احذف", "احذفي", "شيل", "شيلي"); // "امسح الهيرو" is delete, not full reset

    private static List<string> RemoveByMention(List<UiComponent> comps, string lower)
    {
        var removed = new List<string>();
        bool Drop(string type, params string[] words)
        {
            if (!ContainsAny(lower, words)) return false;
            var n = comps.RemoveAll(c => c.Type == type);
            if (n > 0) removed.Add(TypeArabic(type));
            return n > 0;
        }

        Drop("hero", "hero", "هيرو", "العنوان الرئيسي", "عنوان رئيسي");
        Drop("navbar", "navbar", "نافبار", "شريط", "الهيدر", "هيدر", "nav");
        Drop("footer", "footer", "فوتر", "تذييل");
        Drop("login", "login", "لوجين", "تسجيل");
        Drop("profile", "profile", "بروفايل", "ملف");
        Drop("feed", "feed", "فيد", "بوست", "منشور");
        Drop("form", "form", "نموذج", "فورم");
        Drop("features", "features", "مميزات");
        Drop("cards", "cards", "كروت", "بطاقات");
        Drop("stats", "stats", "احصا", "إحصا");
        Drop("cta", "cta", "دعوة");
        Drop("button", "button", "زر");

        if (removed.Count == 0 && ContainsAny(lower, "الكل", "كل شي", "كل شيء", "الصفحة"))
        {
            if (comps.Count > 0)
            {
                removed.Add("كل الأقسام");
                comps.Clear();
            }
        }

        return removed;
    }

    private static (UiPage Page, List<string> Changes) ContinuePage(
        UiPage page,
        string text,
        string lower,
        PageKind kind,
        ThemeTokens theme)
    {
        var comps = page.Components.Select(c => c).ToList();
        var changes = new List<string>();
        var themeChanged = theme.Primary != page.Theme.Primary
                           || theme.Mode != page.Theme.Mode
                           || theme.Background != page.Theme.Background;
        if (themeChanged)
            changes.Add("حدّثت الألوان/الثيم");

        void Ensure(string type, Func<UiComponent> factory, string label, int? insertAt = null)
        {
            if (comps.Any(c => c.Type == type)) return;
            var created = factory();
            if (insertAt is int idx && idx >= 0 && idx <= comps.Count) comps.Insert(idx, created);
            else
            {
                var footerIdx = comps.FindIndex(c => c.Type == "footer");
                if (footerIdx >= 0) comps.Insert(footerIdx, created);
                else comps.Add(created);
            }
            changes.Add($"أضفت {label}");
        }

        // Remove default/welcome hero leftovers that users can't stand
        var starterHero = comps.FirstOrDefault(c =>
            c.Type == "hero" &&
            (c.Props.GetValueOrDefault("title")?.ToString()?.Contains("واجهتك") == true
             || c.Props.GetValueOrDefault("eyebrow")?.ToString()?.Contains("AI UI Builder") == true));
        if (starterHero is not null && (kind != PageKind.Landing || ContainsAny(lower, "احذف", "شيل", "امسح", "بوست", "فيسبوك", "متجر", "لوجين")))
        {
            comps.RemoveAll(c => c.Id == starterHero.Id);
            changes.Add("شلت الهيرو الافتراضي القديم");
        }

        if (kind == PageKind.Interactive || LooksLikeNavbarCompose(lower))
        {
            var (titleIx, compsIx) = BuildInteractive(text, lower);
            return (page with { Title = titleIx, Theme = theme, Components = compsIx },
                ["حدّثت الصفحة التفاعلية / شريط التنقل حسب طلبك"]);
        }

        // Custom layout request: build the exact stack (button/image/link/card) instead of ignoring
        if (kind == PageKind.Custom || LooksLikeCustomLayout(lower))
        {
            var stack = MakeCustomStack(text, lower);
            var existing = comps.FindIndex(c => c.Type == "stack");
            if (existing >= 0)
            {
                comps[existing] = stack;
                changes.Add("حدّثت البطاقة/الستاك حسب طلبك");
            }
            else
            {
                var footerIdx = comps.FindIndex(c => c.Type == "footer");
                if (footerIdx >= 0) comps.Insert(footerIdx, stack);
                else comps.Add(stack);
                changes.Add("أضفت بطاقة مخصصة (زر/صورة/رابط حسب طلبك)");
            }

            // Focus page on the custom piece — drop generic landing noise
            if (ContainsAny(lower, "حط", "حطي", "اعمل", "اعملي", "بس", "فقط", "كارد", "بطاقة", "تحت"))
            {
                comps = comps
                    .Where(c => c.Type is "navbar" or "footer" or "stack")
                    .ToList();
                if (comps.All(c => c.Type != "navbar"))
                    comps.Insert(0, MakeNavbar("علامتي", new[] { "الرئيسية", "حول" }, "ابدأ"));
                if (comps.All(c => c.Type != "stack"))
                    comps.Add(stack);
                if (comps.All(c => c.Type != "footer"))
                    comps.Add(MakeFooter());
                changes.Add("ركزت الصفحة على اللي طلبتيه بدل قالب الهبوط");
            }
        }

        // Explicit delete: احذف الهيرو / شيل النافبار / امسح الفوتر...
        if (ContainsAny(lower, "احذف", "احذفي", "شيل", "شيلي", "امسح", "إمسح", "امسحي", "remove", "delete"))
        {
            var removed = RemoveByMention(comps, lower);
            foreach (var label in removed) changes.Add($"حذفت {label}");
        }

        // Intent-driven merges
        if (kind == PageKind.Social || ContainsAny(lower, "بوست", "فيد", "لايك", "شير", "تعليق", "كومنت", "منشور", "فيسبوك", "انستا", "بروفايل", "معلومات شخص"))
        {
            Ensure("profile", () => MakeProfile(), "بروفايل", Math.Min(1, comps.Count));
            Ensure("feed", () => MakeFeed(), "فيد بوستات");
            if (ContainsAny(lower, "login", "لوجين", "لوغين", "تسجيل", "دخول"))
                Ensure("login", () => MakeLogin("سجّل دخولك", "البريد أو الهاتف", true), "تسجيل دخول", Math.Min(1, comps.Count));

            for (var i = 0; i < comps.Count; i++)
            {
                if (comps[i].Type != "navbar") continue;
                var props = new Dictionary<string, object?>(comps[i].Props)
                {
                    ["brand"] = "FaceBookish",
                    ["links"] = new[] { "الرئيسية", "الأصدقاء", "الإشعارات", "الرسائل" }
                };
                comps[i] = comps[i] with { Props = props };
                changes.Add("حدّثت شريط التنقل لأسلوب سوشال");
                break;
            }
        }

        if (kind == PageKind.Login || ContainsAny(lower, "login", "لوجين", "لوغين", "تسجيل دخول", "باسورد", "كلمة مرور"))
            Ensure("login", () => MakeLogin(), "تسجيل دخول", Math.Min(1, comps.Count));

        if (ContainsAny(lower, "صورة", "image", "img", "ارفع صورة", "ضيف صورة", "أضف صورة"))
        {
            Ensure("image", () => new UiComponent(
                $"img-{Guid.NewGuid().ToString("N")[..6]}",
                "image",
                new Dictionary<string, object?>
                {
                    ["alt"] = "صورة",
                    ["caption"] = "ارفع صورة من التعديل",
                    ["src"] = ""
                }), "صورة");
        }

        if (ContainsAny(lower, "color picker", "colorpicker", "اختيار لون", "منتقي لون"))
            Ensure("colorpicker", MakeColorPicker, "color picker");
        if (ContainsAny(lower, "date picker", "datepicker", "اختيار تاريخ"))
            Ensure("datepicker", MakeDatePicker, "date picker");
        if (ContainsAny(lower, "time picker", "timepicker", "اختيار وقت"))
            Ensure("timepicker", MakeTimePicker, "time picker");

        if (kind == PageKind.Shop || ContainsAny(lower, "متجر", "منتج", "شراء", "عربة"))
        {
            Ensure("cards", () => MakeCards("منتجات مميزة",
            [
                ("قميص كلاسيك", "49$"),
                ("جاكيت خفيف", "89$"),
                ("سنيكرز", "79$")
            ]), "كروت منتجات");
            Ensure("cta", () => MakeCta("تسوق الآن", "شحن سريع لجميع الطلبات."), "CTA متجر");
        }

        if (ContainsAny(lower, "form", "نموذج", "تواصل", "contact"))
            Ensure("form", () => MakeForm(), "نموذج تواصل");

        if (ContainsAny(lower, "مميزات", "features"))
            Ensure("features", MakeFeatures, "قسم مميزات", FooterInsertIndex(comps));

        if (ContainsAny(lower, "stats", "احصا", "إحصا", "أرقام", "احصائيات", "إحصائيات", "إحصاءات", "احصاءات"))
            Ensure("stats", MakeStats, "إحصائيات", FooterInsertIndex(comps));

        if (ContainsAny(lower, "chart", "تشارت", "شارت", "رسم بياني", "مخطط"))
            Ensure("chart", MakeChart, "chart", FooterInsertIndex(comps));

        if (ContainsAny(lower, "كروت", "cards", "بطاقات") && !ContainsAny(lower, "يوزر", "usercard", "user card"))
        {
            var count = ExtractCount(lower, 3);
            var items = Enumerable.Range(1, count)
                .Select(i => ($"بطاقة {i}", $"وصف مختصر للبطاقة {i}"))
                .ToArray();
            var footerIdx = FooterInsertIndex(comps);
            var existingCards = comps.FindIndex(c => c.Type == "cards");
            if (existingCards >= 0 && ContainsAny(lower, "عدد", "٢", "2", "3", "4", "5", "اثنين", "ثنين", "ثلاث"))
            {
                comps[existingCards] = MakeCards("كروت", items);
                changes.Add($"حدّثت الكروت إلى {count}");
            }
            else
            {
                Ensure("cards", () => MakeCards("كروت", items), $"كروت ({count})", footerIdx);
            }
        }

        if (ContainsAny(lower, "هيرو", "hero") && !ContainsAny(lower, "احذف", "شيل", "امسح"))
            Ensure("hero", () => MakeHero("عنوان رئيسي", "وصف قصير للقسم.", "ابدأ", "New"), "هيرو", Math.Min(1, comps.Count));

        if (ContainsAny(lower, "navbar", "نافبار", "شريط تنقل", "هيدر")
            && !ContainsAny(lower, "سايدبار", "sidebar", "بيرجر", "burger", "hamburger"))
            Ensure("navbar", () => MakeNavbar("علامتي", new[] { "الرئيسية", "حول", "تواصل" }, "ابدأ"), "شريط تنقل", 0);

        if (ContainsAny(lower, "سايدبار", "sidebar", "side bar", "قائمة جانبية"))
            Ensure("sidebar", MakeSidebar, "سايدبار منيو", 0);

        if (ContainsAny(lower, "بيرجر", "burger", "همبرغر", "همبرجر", "hamburger", "قائمة همبرغر"))
            Ensure("burgermenu", MakeBurgerMenu, "بيرجر منيو", 0);

        if (LooksLikeSectionsLayout(lower) || ContainsAny(lower, "اقسام", "أقسام", "ديف مقسم", "sections", "grid"))
        {
            var count = ExtractCount(lower, 3);
            var existing = comps.FindIndex(c => c.Type == "sections");
            if (existing >= 0)
            {
                comps[existing] = MakeSections(count, lower);
                changes.Add($"حدّثت الأقسام إلى {count}");
            }
            else
                Ensure("sections", () => MakeSections(count, lower), $"أقسام ({count})", FooterInsertIndex(comps));
        }

        if (ContainsAny(lower, "footer", "فوتر", "تذييل"))
            Ensure("footer", () => MakeFooter(), "فوتر");

        if (ContainsAny(lower, "cta", "دعوة"))
            Ensure("cta", () => MakeCta("جاهز تكمل؟", "خلينا نكمّل البناء سوا."), "CTA");

        if (ContainsAny(lower, "search", "سيرش", "بحث"))
            Ensure("search", MakeSearch, "بحث");

        if (ContainsAny(lower, "multiselect", "ملتي", "اختيار متعدد", "متعدد"))
            Ensure("multiselect", MakeMultiSelect, "اختيار متعدد");

        if (ContainsAny(lower, "dropdown", "دروب", "قائمة منسدلة") && !ContainsAny(lower, "multiselect", "ملتي"))
            Ensure("dropdown", MakeDropdown, "دروب داون");

        if (ContainsAny(lower, "single select", "سنجل", "اختيار واحد", "select") &&
            !ContainsAny(lower, "multiselect", "ملتي", "dropdown", "دروب"))
            Ensure("select", MakeSingleSelect, "اختيار واحد");

        if (ContainsAny(lower, "usercard", "يوزر كارد", "كارد يوزر", "بطاقة مستخدم", "user card"))
            Ensure("usercard", MakeUserCard, "يوزر كارد");

        // Text edits on hero / profile / titles
        if (ContainsAny(lower, "عنوان", "title", "اسم", "سمي", "سمّي", "خلّي العنوان", "خلي العنوان"))
        {
            var newTitle = ExtractTitle(text, "");
            if (!string.IsNullOrWhiteSpace(newTitle))
            {
                for (var i = 0; i < comps.Count; i++)
                {
                    if (comps[i].Type is not ("hero" or "profile" or "cta")) continue;
                    var props = new Dictionary<string, object?>(comps[i].Props);
                    if (comps[i].Type == "profile") props["name"] = newTitle;
                    else props["title"] = newTitle;
                    comps[i] = comps[i] with { Props = props };
                    changes.Add($"غيّرت العنوان إلى «{newTitle}»");
                    break;
                }
            }
        }

        if (ContainsAny(lower, "زر", "button", "cta") && ContainsAny(lower, "غيّر", "غير", "خلّي", "خلي", "سمّي", "سمي"))
        {
            var label = ExtractQuotedOrFallback(text, "");
            if (!string.IsNullOrWhiteSpace(label))
            {
                for (var i = 0; i < comps.Count; i++)
                {
                    if (comps[i].Type is not ("hero" or "cta" or "button")) continue;
                    var props = new Dictionary<string, object?>(comps[i].Props);
                    if (props.ContainsKey("ctaLabel")) props["ctaLabel"] = label;
                    else if (props.ContainsKey("buttonLabel")) props["buttonLabel"] = label;
                    else props["label"] = label;
                    comps[i] = comps[i] with { Props = props };
                    changes.Add($"غيّرت نص الزر إلى «{label}»");
                    break;
                }
            }
        }

        // Also run classic refine add-ons
        var refined = RefinePage(page with { Theme = theme, Components = comps }, lower, text);
        if (refined.Components.Count != comps.Count)
        {
            foreach (var c in refined.Components.Where(c => comps.All(x => x.Id != c.Id || x.Type != c.Type)))
            {
                if (comps.All(x => x.Type != c.Type))
                    changes.Add($"أضفت {TypeArabic(c.Type)}");
            }
            comps = refined.Components.ToList();
        }

        var title = page.Title;
        if (kind != PageKind.Landing && kind != PageKind.Refine && kind != PageKind.ThemeOnly)
            title = kind switch
            {
                PageKind.Social => "شبكة اجتماعية",
                PageKind.Login => "صفحة تسجيل دخول",
                PageKind.Shop => "متجر إلكتروني",
                PageKind.Dashboard => "لوحة تحكم",
                PageKind.Blog => "مدونة",
                PageKind.Portfolio => "بورتفوليو",
                PageKind.Restaurant => "مطعم",
                PageKind.Custom => "تصميم مخصص",
                _ => page.Title
            };

        var next = page with
        {
            Title = title,
            Theme = theme,
            Description = string.IsNullOrWhiteSpace(page.Description)
                ? Shorten(text, 140)
                : page.Description,
            Components = comps
        };
        return (next, changes.Distinct().ToList());
    }

    private static string BuildReply(string userText, string title, PageKind kind, List<UiComponent> comps)
    {
        var sections = string.Join(" + ", comps.Select(c => TypeArabic(c.Type)).Distinct());
        var asked = Shorten(userText, 60);
        return kind switch
        {
            PageKind.Social => $"بنيت أساس شبكة اجتماعية حسب «{asked}»: {sections}.",
            PageKind.Login => $"جهّزت صفحة تسجيل دخول حسب «{asked}»: {sections}.",
            PageKind.Shop => $"جهّزت متجر «{title}»: {sections}.",
            PageKind.Dashboard => $"جهّزت لوحة التحكم: {sections}.",
            PageKind.Blog => $"جهّزت مدونة «{title}»: {sections}.",
            PageKind.Portfolio => $"جهّزت بورتفوليو «{title}»: {sections}.",
            PageKind.Restaurant => $"جهّزت صفحة مطعم «{title}»: {sections}.",
            PageKind.Custom => $"بنيت تصميم مخصص حسب «{asked}» بالضبط قدر الإمكان: {sections}.",
            PageKind.Split => $"بنيت الصفحة نصّين/عمودين حسب «{asked}»: {sections}.",
            _ => $"فهمت «{asked}» وبنيت «{title}»: {sections}."
        };
    }

    private static string TypeArabic(string type) => type switch
    {
        "navbar" => "شريط تنقل",
        "sidebar" => "سايدبار منيو",
        "burgermenu" => "بيرجر منيو",
        "hero" => "هيرو",
        "features" => "مميزات",
        "cards" => "كروت",
        "stats" => "إحصائيات",
        "chart" => "رسم بياني",
        "form" => "نموذج",
        "login" => "تسجيل دخول",
        "profile" => "بروفايل",
        "feed" => "فيد بوستات",
        "cta" => "CTA",
        "footer" => "فوتر",
        "button" => "زر",
        "stack" => "بطاقة/ستاك مخصص",
        "split" => "عمودين",
        "sections" => "أقسام/ديف",
        "image" => "صورة",
        "link" => "رابط",
        "search" => "بحث",
        "select" => "اختيار واحد",
        "multiselect" => "اختيار متعدد",
        "dropdown" => "دروب داون",
        "usercard" => "يوزر كارد",
        "colorpicker" => "color picker",
        "datepicker" => "date picker",
        "timepicker" => "time picker",
        _ => type
    };

    private static string Shorten(string text, int max)
    {
        var t = text.Trim().Replace("\n", " ");
        return t.Length <= max ? t : t[..max] + "…";
    }

    private enum PageKind
    {
        Social,
        Login,
        Shop,
        Dashboard,
        Blog,
        Portfolio,
        Restaurant,
        Custom,
        Interactive,
        Split,
        Landing,
        Refine,
        ThemeOnly
    }

    private static bool LooksLikeSplitLayout(string lower)
    {
        var splitWords = ContainsAny(lower,
            "نصفين", "نصين", "شطرين", "عمودين", "عمودین", "قسمين", "جزئين",
            "side by side", "split", "two column", "two columns", "50/50", "نصف نصف");
        var firstSecond = ContainsAny(lower, "الأول", "الاول", "أول", "اول")
                          && ContainsAny(lower, "الثاني", "التاني", "ثاني", "تاني", "الثانية", "التانية");
        var halves = ContainsAny(lower, "نص الأول", "نص الاول", "نصف", "الشق", "الجانب");
        if (!(splitWords || (firstSecond && halves) || (firstSecond && ContainsAny(lower, "فيه", "فيها", "في"))))
            return false;

        // Need at least one concrete pane content
        return ContainsAny(lower,
            "صورة", "image", "لوجين", "login", "فورم", "form", "تسجيل",
            "نموذج", "بحث", "سيرش", "كروت", "مميزات", "نص");
    }

    private static bool LooksLikeCustomLayout(string lower)
    {
        if (LooksLikeSplitLayout(lower) || LooksLikeNavbarCompose(lower)) return false;

        var parts = 0;
        if (ContainsAny(lower, "زر", "button", "كبسة", "كباس", "بوتوم", "بوتم", "بتون", "بوتن", "bottom", "btn")) parts++;
        if (ContainsAny(lower, "صورة", "image", "img", "صوره", "pic", "picture")) parts++;
        if (ContainsAny(lower, "رابط", "link", "لينك", "لينكات", "url")) parts++;
        // Avoid counting "نص" inside "نصفين/نصين/نص الأول"
        if (ContainsAny(lower, "فقرة", "text") || Regex.IsMatch(lower, @"(?<![فص])نص(?![ينف])")) parts++;

        var layoutFlow = ContainsAny(lower, "تحت", "فوق", "بعدين", "ثم", "وبعد", "جوا", "داخل", "حط", "حطي", "حطّي", "stack");
        var cardWord = ContainsAny(lower, "كارد", "كاردا", "بطاقة", "card")
                       && !ContainsAny(lower, "يوزر", "user", "مستخدم");
        // require real layout intent — not just "يوزر كارد"
        return (layoutFlow && parts >= 1) || (cardWord && parts >= 2) || parts >= 2;
    }

    private static bool LooksLikeNavbarCompose(string lower) =>
        ContainsAny(lower, "شريط تنقل", "شريط", "navbar", "نافبار", "هيدر")
        && ContainsAny(lower, "سيرش", "search", "بحث", "بوكس", "دروب", "dropdown", "يوزر", "usercard", "سيلكت", "select");

    private static bool LooksLikeInteractive(string lower) =>
        LooksLikeNavbarCompose(lower) ||
        ContainsAny(lower,
            "search", "سيرش", "بحث",
            "multiselect", "ملتي", "ملتي سيلكت", "اختيار متعدد",
            "dropdown", "دروب", "دروب داون", "قائمة منسدلة",
            "single select", "سنجل", "سيلكت", "اختيار واحد",
            "usercard", "يوزر كارد", "يوزر", "بطاقة مستخدم", "user card",
            "color picker", "colorpicker", "كولور بيكير", "اختيار لون", "منتقي لون",
            "date picker", "datepicker", "دیت پیکر", "اختيار تاريخ", "منتقي تاريخ",
            "time picker", "timepicker", "تايم بيكير", "اختيار وقت", "منتقي وقت");

    private static PageKind DetectKind(string lower)
    {
        var themeOnly = ContainsAny(lower, "ثيم", "theme", "لون", "ألوان", "الوان", "dark", "light", "داكن", "فاتح", "أزرق", "ازرق", "أحمر", "اخضر", "أخضر", "بنفسج")
                        && !ContainsAny(lower, "صفحة", "page", "هبوط", "متجر", "لوحة", "فيسبوك", "facebook", "بوست", "login", "تسجيل", "مطعم", "مدونة", "portfolio", "زر", "صورة", "كارد", "سيرش", "سيلكت");
        if (themeOnly) return PageKind.ThemeOnly;

        if (LooksLikeSplitLayout(lower))
            return PageKind.Split;

        if (LooksLikeNavbarCompose(lower) || (LooksLikeInteractive(lower) && !LooksLikeCustomLayout(lower)))
            return PageKind.Interactive;

        // Custom layouts first — don't swallow them into generic landing
        if (LooksLikeCustomLayout(lower))
            return PageKind.Custom;

        if (ContainsAny(lower,
                "facebook", "فيسبوك", "فيس بوك", "face book",
                "instagram", "انستا", "انستغرام", "إنستغرام",
                "twitter", "تويتر", "تيك توك", "tiktok",
                "social", "سوشال", "شبكة اجتماعية", "شبكة اجتماعي",
                "بوست", "posts", "منشور", "لايك", "like", "كومنت", "تعليق",
                "شير", "share", "فيد", "feed", "timeline",
                "بروفايل", "profile", "ملف شخصي", "معلومات شخصية", "معلومات شخصيه",
                "أصدقاء", "اصدقاء", "مجتمع"))
            return PageKind.Social;

        if (ContainsAny(lower, "login", "لوجين", "لوغين", "تسجيل دخول", "تسجيل الدخول", "sign in", "signin", "auth", "كلمة مرور", "باسورد", "صفحة دخول")
            && !ContainsAny(lower, "facebook", "فيسبوك", "فيس بوك", "بوست", "posts", "منشور", "سوشال", "social", "feed", "فيد", "انستا"))
            return PageKind.Login;

        if (ContainsAny(lower, "متجر", "shop", "store", "منتج", "منتجات", "ملابس", "ecommerce", "عربة", "شراء", "ecommerce"))
            return PageKind.Shop;

        // Don't treat bare "إحصائيات" as a full dashboard rebuild — that's an add-section request
        if (ContainsAny(lower, "dashboard", "داشبورد", "دشبورد", "لوحة تحكم", "لوحة التحكم", "analytics", "تقارير")
            || (ContainsAny(lower, "لوحة") && ContainsAny(lower, "تحكم", "dashboard", "ادمن", "admin")))
            return PageKind.Dashboard;

        if (ContainsAny(lower, "blog", "مدونة", "مقال", "مقالات", "أخبار", "اخبار"))
            return PageKind.Blog;

        if (ContainsAny(lower, "portfolio", "بورتفوليو", "معرض أعمال", "معرض اعمال", "أعمالي", "اعمالي"))
            return PageKind.Portfolio;

        if (ContainsAny(lower, "restaurant", "مطعم", "كافيه", "قهوة", "منيو", "menu", "طعام"))
            return PageKind.Restaurant;

        if (IsExplicitRefine(lower))
            return PageKind.Refine;

        // explicit landing only — otherwise still landing fallback but reply will quote the user
        return PageKind.Landing;
    }

    private static bool IsExplicitRefine(string lower) =>
        ContainsAny(lower,
            "عدّل الصفحة", "عدل الصفحة", "أضف قسم", "اضف قسم", "ضيف قسم",
            "أضف فوتر", "اضف فوتر", "أضف نموذج", "اضف نموذج",
            "غيّر العنوان", "غير العنوان", "بدّل الزر", "بدل الزر",
            "refine", "update the", "add a section", "add section");

    private static (string Title, List<UiComponent> Components) BuildPage(
        PageKind kind, string text, string lower, ThemeTokens theme)
    {
        return kind switch
        {
            PageKind.Social => BuildSocial(text, lower),
            PageKind.Login => BuildLogin(text),
            PageKind.Shop => BuildShop(text),
            PageKind.Dashboard => BuildDashboard(),
            PageKind.Blog => BuildBlog(text),
            PageKind.Portfolio => BuildPortfolio(text),
            PageKind.Restaurant => BuildRestaurant(text),
            PageKind.Custom => BuildCustom(text, lower),
            PageKind.Interactive => BuildInteractive(text, lower),
            PageKind.Split => BuildSplit(text, lower),
            _ => LooksLikeCustomLayout(lower) ? BuildCustom(text, lower) : BuildLanding(text, lower)
        };
    }

    private static (string, List<UiComponent>) BuildSplit(string text, string lower)
    {
        var (left, right) = ParseSplitPanes(lower);
        var split = new UiComponent(
            $"split-{Guid.NewGuid().ToString("N")[..6]}",
            "split",
            new Dictionary<string, object?>
            {
                ["title"] = "تخطيط عمودين",
                ["ratio"] = "1fr 1fr",
                ["left"] = left,
                ["right"] = right
            },
            PaneActions(left).Concat(PaneActions(right)).ToList());

        return ("صفحة عمودين",
        [
            MakeNavbar("علامتي", new[] { "الرئيسية", "حول", "تواصل" }, "ابدأ"),
            split,
            MakeFooter("© Split layout · صورة + فورم")
        ]);
    }

    private static IEnumerable<UiAction> PaneActions(Dictionary<string, object?> pane)
    {
        var kind = pane.GetValueOrDefault("kind")?.ToString() ?? "";
        if (kind is "login" or "form")
            yield return new UiAction($"split-{kind}", "alert",
                kind == "login" ? "دخول" : "إرسال", null, $"تم من الـ {kind}");
    }

    private static string DescribeSplit(List<UiComponent> comps)
    {
        var split = comps.FirstOrDefault(c => c.Type == "split");
        if (split is null) return "عمودين";
        var left = PaneLabel(split.Props.GetValueOrDefault("left"));
        var right = PaneLabel(split.Props.GetValueOrDefault("right"));
        return $"يسار/أول = {left} · يمين/ثاني = {right}";
    }

    private static string PaneLabel(object? paneObj)
    {
        if (paneObj is Dictionary<string, object?> d)
            return d.GetValueOrDefault("kind")?.ToString() switch
            {
                "image" => "صورة",
                "login" => "لوجين فورم",
                "form" => "نموذج",
                "text" => "نص",
                "search" => "بحث",
                _ => "محتوى"
            };
        return "محتوى";
    }

    private static (Dictionary<string, object?> Left, Dictionary<string, object?> Right) ParseSplitPanes(string lower)
    {
        // Split around الثاني / التانية / and
        var markers = new[] { "الثانية", "التانية", "الثاني", "التاني", "والثاني", "والتنية", "والثانية", " and ", " ثم " };
        var cut = -1;
        foreach (var m in markers)
        {
            var i = lower.IndexOf(m, StringComparison.OrdinalIgnoreCase);
            if (i >= 0) { cut = i; break; }
        }

        string firstPart;
        string secondPart;
        if (cut >= 0)
        {
            firstPart = lower[..cut];
            secondPart = lower[cut..];
        }
        else
        {
            firstPart = lower;
            secondPart = lower;
        }

        var left = DetectPane(firstPart, fallback: "image");
        var right = DetectPane(secondPart, fallback: "login");

        // If both same, try global order: image mentioned before login → left image
        if (Equals(left.GetValueOrDefault("kind"), right.GetValueOrDefault("kind")))
        {
            var imgAt = IndexOfAny(lower, "صورة", "image");
            var loginAt = IndexOfAny(lower, "لوجين", "login", "فورم", "form", "تسجيل");
            if (imgAt >= 0 && loginAt >= 0)
            {
                if (imgAt < loginAt) { left = MakePane("image"); right = MakePane("login"); }
                else { left = MakePane("login"); right = MakePane("image"); }
            }
            else
            {
                left = MakePane("image");
                right = MakePane("login");
            }
        }

        return (left, right);
    }

    private static int IndexOfAny(string hay, params string[] needles)
    {
        var best = -1;
        foreach (var n in needles)
        {
            var i = hay.IndexOf(n, StringComparison.OrdinalIgnoreCase);
            if (i >= 0 && (best < 0 || i < best)) best = i;
        }
        return best;
    }

    private static Dictionary<string, object?> DetectPane(string segment, string fallback)
    {
        if (ContainsAny(segment, "لوجين", "login", "تسجيل دخول", "تسجيل"))
            return MakePane("login");
        if (ContainsAny(segment, "فورم", "form", "نموذج") && !ContainsAny(segment, "لوجين", "login"))
            return MakePane("form");
        if (ContainsAny(segment, "صورة", "image", "img", "صوره"))
            return MakePane("image");
        if (ContainsAny(segment, "بحث", "سيرش", "search"))
            return MakePane("search");
        if (ContainsAny(segment, "كروت", "cards"))
            return MakePane("cards");
        if (ContainsAny(segment, "فقرة") || Regex.IsMatch(segment, @"(?<![فص])نص(?![ينف])"))
            return MakePane("text");
        return MakePane(fallback);
    }

    private static Dictionary<string, object?> MakePane(string kind) => kind switch
    {
        "image" => new Dictionary<string, object?>
        {
            ["kind"] = "image",
            ["alt"] = "صورة",
            ["caption"] = "ارفع صورة من التعديل",
            ["src"] = ""
        },
        "login" => new Dictionary<string, object?>
        {
            ["kind"] = "login",
            ["title"] = "تسجيل الدخول",
            ["usernameLabel"] = "اسم المستخدم",
            ["passwordLabel"] = "كلمة المرور",
            ["submitLabel"] = "دخول",
            ["showSignup"] = true,
            ["signupLabel"] = "إنشاء حساب جديد"
        },
        "form" => new Dictionary<string, object?>
        {
            ["kind"] = "form",
            ["title"] = "نموذج",
            ["subtitle"] = "عبّي البيانات",
            ["fields"] = new[] { "الاسم", "البريد", "الرسالة" },
            ["submitLabel"] = "إرسال"
        },
        "search" => new Dictionary<string, object?>
        {
            ["kind"] = "search",
            ["title"] = "بحث",
            ["placeholder"] = "ابحث..."
        },
        "cards" => new Dictionary<string, object?>
        {
            ["kind"] = "cards",
            ["title"] = "كروت",
            ["items"] = new object[]
            {
                new { title = "بطاقة 1", desc = "وصف" },
                new { title = "بطاقة 2", desc = "وصف" }
            }
        },
        _ => new Dictionary<string, object?>
        {
            ["kind"] = "text",
            ["title"] = "نص",
            ["text"] = "محتوى هذا العمود"
        }
    };

    private static (string, List<UiComponent>) BuildInteractive(string text, string lower)
    {
        // "شريط تنقل فيه سيرش يمين ودروب داون ويوزر كارد شمال"
        if (LooksLikeNavbarCompose(lower))
        {
            var nav = MakeRichNavbar(lower);
            return ("شريط تنقل تفاعلي",
            [
                nav,
                MakeFooter("© Navbar compose · search + dropdown + user card")
            ]);
        }

        var comps = new List<UiComponent>
        {
            MakeNavbar("Demo App", new[] { "بحث", "اختيار", "مستخدمين" }, "تجربة")
        };

        var any = false;
        if (ContainsAny(lower, "search", "سيرش", "بحث"))
        {
            comps.Add(MakeSearch());
            any = true;
        }
        if (ContainsAny(lower, "multiselect", "ملتي", "اختيار متعدد", "متعدد"))
        {
            comps.Add(MakeMultiSelect());
            any = true;
        }
        if (ContainsAny(lower, "dropdown", "دروب", "قائمة منسدلة"))
        {
            comps.Add(MakeDropdown());
            any = true;
        }
        if (ContainsAny(lower, "single select", "سنجل", "سيلكت", "اختيار واحد") ||
            (ContainsAny(lower, "select") && !ContainsAny(lower, "multiselect", "ملتي", "dropdown", "دروب")))
        {
            comps.Add(MakeSingleSelect());
            any = true;
        }
        if (ContainsAny(lower, "usercard", "يوزر", "بطاقة مستخدم", "user card"))
        {
            comps.Add(MakeUserCard());
            any = true;
        }
        if (ContainsAny(lower, "color picker", "colorpicker", "كولور بيكير", "اختيار لون", "منتقي لون", "colorpicker"))
        {
            comps.Add(MakeColorPicker());
            any = true;
        }
        if (ContainsAny(lower, "date picker", "datepicker", "اختيار تاريخ", "منتقي تاريخ", "دیت پیکر"))
        {
            comps.Add(MakeDatePicker());
            any = true;
        }
        if (ContainsAny(lower, "time picker", "timepicker", "تايم بيكير", "اختيار وقت", "منتقي وقت"))
        {
            comps.Add(MakeTimePicker());
            any = true;
        }

        if (!any)
        {
            comps.Add(MakeSearch());
            comps.Add(MakeSingleSelect());
            comps.Add(MakeMultiSelect());
            comps.Add(MakeDropdown());
            comps.Add(MakeUserCard());
            comps.Add(MakeColorPicker());
            comps.Add(MakeDatePicker());
            comps.Add(MakeTimePicker());
        }

        comps.Add(MakeFooter("© Demo interactive · .NET API ↔ React"));
        return ("صفحة تفاعلية", comps);
    }

    private static UiComponent MakeRichNavbar(string lower)
    {
        // Compose path already matched — include requested slots (default all three)
        var wantSearch = ContainsAny(lower, "search", "سيرش", "بحث", "بوكس")
                         || !ContainsAny(lower, "dropdown", "دروب", "يوزر", "usercard");
        var wantDropdown = ContainsAny(lower, "dropdown", "دروب", "سيلكت", "select");
        var wantUser = ContainsAny(lower, "usercard", "يوزر", "user", "مستخدم");
        if (!wantSearch && !wantDropdown && !wantUser)
        {
            wantSearch = wantDropdown = wantUser = true;
        }

        // RTL: يمين = search+dropdown cluster, شمال = user card
        return new(
            $"nav-{Guid.NewGuid().ToString("N")[..6]}",
            "navbar",
            new Dictionary<string, object?>
            {
                ["brand"] = "علامتي",
                ["links"] = new[] { "الرئيسية", "حول", "تواصل" },
                ["showSearch"] = wantSearch,
                ["searchPlaceholder"] = "ابحث...",
                ["showDropdown"] = wantDropdown,
                ["dropdownPlaceholder"] = "اختر...",
                ["dropdownOptions"] = new object[]
                {
                    new { value = "all", label = "الكل" },
                    new { value = "design", label = "تصميم" },
                    new { value = "dev", label = "تطوير" }
                },
                ["showUserCard"] = wantUser,
                ["userName"] = "سارة خالد",
                ["userRole"] = "UI Designer",
                ["userCity"] = "عمّان"
            },
            [new UiAction("nav-cta", "alert", "حسابي", null, "فتح حساب المستخدم")]);
    }

    private static (string, List<UiComponent>) BuildCustom(string text, string lower)
    {
        var stack = MakeCustomStack(text, lower);
        // Keep it focused — no fake hero that repeats the user request as a title
        return ("تصميم مخصص",
        [
            MakeNavbar("علامتي", new[] { "الرئيسية", "حول", "تواصل" }, "ابدأ"),
            stack,
            MakeFooter()
        ]);
    }

    private static UiComponent MakeCustomStack(string text, string lower)
    {
        var items = ParseStackItems(lower, text);
        if (items.Count == 0)
        {
            items =
            [
                new Dictionary<string, object?> { ["kind"] = "button", ["label"] = "اضغط هنا" },
                new Dictionary<string, object?> { ["kind"] = "image", ["alt"] = "صورة", ["caption"] = "صورة" },
                new Dictionary<string, object?> { ["kind"] = "link", ["label"] = "افتح الرابط", ["href"] = "#" },
            ];
        }

        // Order by "تحت" sequence if present: first mentioned = top
        return new(
            $"stack-{Guid.NewGuid().ToString("N")[..6]}",
            "stack",
            new Dictionary<string, object?>
            {
                ["title"] = "بطاقة",
                ["subtitle"] = "حسب طلبك",
                ["inCard"] = true,
                ["items"] = items
            },
            [
                new UiAction("stack-btn", "alert", "زر", null, "تم الضغط على الزر"),
                new UiAction("stack-link", "alert", "رابط", null, "تم فتح الرابط (demo)")
            ]);
    }

    private static List<Dictionary<string, object?>> ParseStackItems(string lower, string text)
    {
        var found = new List<(int Index, Dictionary<string, object?> Item)>();

        void TryAdd(string[] words, Dictionary<string, object?> item)
        {
            var idx = words
                .Select(w => lower.IndexOf(w, StringComparison.OrdinalIgnoreCase))
                .Where(i => i >= 0)
                .DefaultIfEmpty(-1)
                .Min();
            if (idx < 0) return;
            if (found.Any(f => Equals(f.Item.GetValueOrDefault("kind"), item["kind"]))) return;
            found.Add((idx, item));
        }

        var buttonLabel = ExtractQuotedOrFallback(text, "اضغط هنا");
        if (string.IsNullOrWhiteSpace(buttonLabel)) buttonLabel = "اضغط هنا";

        TryAdd(["زر", "button", "كبسة", "بوتوم", "بوتم", "بتون", "بوتن", "bottom", "btn"], new Dictionary<string, object?>
        {
            ["kind"] = "button",
            ["label"] = buttonLabel
        });
        TryAdd(["صورة", "صوره", "image", "img", "picture", "pic"], new Dictionary<string, object?>
        {
            ["kind"] = "image",
            ["alt"] = "صورة",
            ["caption"] = "صورة توضيحية"
        });
        TryAdd(["رابط", "link", "لينك", "لينكات", "url"], new Dictionary<string, object?>
        {
            ["kind"] = "link",
            ["label"] = "افتح الرابط",
            ["href"] = "#"
        });
        TryAdd(["نص", "فقرة"], new Dictionary<string, object?>
        {
            ["kind"] = "text",
            ["text"] = "هذا نص داخل البطاقة"
        });

        return found.OrderBy(f => f.Index).Select(f => f.Item).ToList();
    }

    private static (string, List<UiComponent>) BuildSocial(string text, string lower)
    {
        var wantsLogin = ContainsAny(lower, "login", "لوجين", "لوغين", "تسجيل", "دخول");
        var comps = new List<UiComponent>
        {
            MakeNavbar("FaceBookish", new[] { "الرئيسية", "الأصدقاء", "الإشعارات", "الرسائل" }, "نشر"),
        };

        if (wantsLogin)
            comps.Add(MakeLogin("سجّل دخولك لفيسبوك", "البريد أو الهاتف", true));

        comps.Add(MakeProfile(
            "أحمد العلي",
            "عمّان · مطور واجهات",
            "أحب التصوير والسفر وبناء منتجات رقمية.",
            "342", "128", "56"));

        comps.Add(MakeFeed(
        [
            ("سارة خالد", "قبل ساعتين",
                "صباح الخير! مشروع جديد بالشغل وحاسة اليوم رح يكون منتج ☕",
                "128", "24", "11"),
            ("محمد حسن", "قبل 5 ساعات",
                "شاركت اليوم نموذج أولي لتطبيق سوشال — مين بحب يجرب؟",
                "86", "19", "7"),
            ("نور أبو زيد", "أمس",
                "مجموعة صور من الرحلة الأخيرة 🌄 التعليقات تشرح القلب.",
                "240", "41", "33")
        ]));

        if (!wantsLogin)
            comps.Add(MakeCta("انضم للمجتمع", "أنشئ حساباً وابدأ بمشاركة لحظاتك مع أصدقائك."));

        comps.Add(MakeFooter("© FaceBookish — شبكة تجريبية"));
        return ("شبكة اجتماعية", comps);
    }

    private static (string, List<UiComponent>) BuildLogin(string text)
    {
        var comps = new List<UiComponent>
        {
            MakeNavbar("حسابي", new[] { "الرئيسية", "مساعدة" }, "إنشاء حساب"),
            MakeHero("سجّل دخولك", "ادخل لحسابك وتابع من حيث توقفت.", "متابعة", "Welcome back"),
            MakeLogin("تسجيل الدخول", "البريد الإلكتروني", true),
            MakeFooter()
        };
        return ("صفحة تسجيل دخول", comps);
    }

    private static (string, List<UiComponent>) BuildShop(string text)
    {
        var comps = new List<UiComponent>
        {
            MakeNavbar("متجري", new[] { "الرئيسية", "المنتجات", "العروض", "تواصل" }, "العربة"),
            MakeHero(ExtractTitle(text, "متجر أنيق لستايلك"),
                "اكتشف مجموعات جديدة، عروض موسمية، وتجربة شراء سلسة.",
                "تسوق الآن", "New Season"),
            MakeCards("منتجات مميزة",
            [
                ("قميص كلاسيك", "خامة مريحة بقصة عصرية — 49$"),
                ("جاكيت خفيف", "مثالي للربيع والخريف — 89$"),
                ("سنيكرز يومي", "راحة طوال اليوم — 79$")
            ]),
            MakeCta("شحن مجاني فوق 100$", "أضف للعربة الآن وخلّص طلبك بدقايق."),
            MakeFooter()
        };
        return ("متجر إلكتروني", comps);
    }

    private static (string, List<UiComponent>) BuildDashboard()
    {
        var comps = new List<UiComponent>
        {
            MakeNavbar("لوحة التحكم", new[] { "نظرة عامة", "التقارير", "الإعدادات" }, "تصدير"),
            MakeHero("لوحة تحكم ذكية", "راقب أرقامك، المهام، والنشاط في مكان واحد.", "عرض التقارير", "Insights"),
            MakeStats(),
            MakeCards("نظرة سريعة",
            [
                ("المبيعات", "تتبع الطلبات اليومية والتحويلات."),
                ("المستخدمون", "نمو الاشتراكات والتفاعل."),
                ("الأداء", "زمن الاستجابة ومؤشرات الجودة.")
            ]),
            MakeFooter()
        };
        return ("لوحة تحكم", comps);
    }

    private static (string, List<UiComponent>) BuildBlog(string text)
    {
        var comps = new List<UiComponent>
        {
            MakeNavbar("مدونتي", new[] { "مقالات", "تصنيفات", "عني" }, "اشترك"),
            MakeHero(ExtractTitle(text, "أفكار تُقرأ ببطء"), "مقالات أسبوعية عن التصميم، المنتج، والبناء.", "اقرأ الآن", "Blog"),
            MakeCards("أحدث المقالات",
            [
                ("كيف تصمم صفحة هبوط", "دليل عملي من الهيرو للـ CTA."),
                ("الثيمات والهوية", "ألوان، خطوط، وإحساس العلامة."),
                ("من الفكرة للإطلاق", "خطوات صغيرة كل يوم.")
            ]),
            MakeForm("اشترك بالنشرة", "وصّل لأحدث المقالات مباشرة.", new[] { "الاسم", "البريد" }, "اشتراك"),
            MakeFooter()
        };
        return ("مدونة", comps);
    }

    private static (string, List<UiComponent>) BuildPortfolio(string text)
    {
        var comps = new List<UiComponent>
        {
            MakeNavbar("أعمالي", new[] { "عمل", "عني", "تواصل" }, "تواصل"),
            MakeHero(ExtractTitle(text, "أصمم تجارب رقمية واضحة"), "مصمم/مطوّر أبني واجهات سريعة وأنيقة.", "شاهد الأعمال", "Portfolio"),
            MakeCards("مشاريع مختارة",
            [
                ("منصة حجوزات", "React + .NET — تحسين التحويل 32%"),
                ("تطبيق صحة", "تجربة موبايل بسيطة وهادئة"),
                ("لوحة بيانات", "تصور حي للمبيعات")
            ]),
            MakeForm(),
            MakeFooter()
        };
        return ("بورتفوليو", comps);
    }

    private static (string, List<UiComponent>) BuildRestaurant(string text)
    {
        var comps = new List<UiComponent>
        {
            MakeNavbar("مطعم البيت", new[] { "المنيو", "الحجز", "الموقع" }, "احجز طاولة"),
            MakeHero(ExtractTitle(text, "نكهات ترجعك للبيت"), "مأكولات شرقية طازجة، أجواء دافئة، وحجز سهل.", "شوف المنيو", "Kitchen"),
            MakeCards("توقيع المطبخ",
            [
                ("مشاوي مشكلة", "لحم طازج على الفحم"),
                ("منسف بلدي", "بالجميد الأردني"),
                ("حلويات يومية", "كنافة ونمورة")
            ]),
            MakeForm("احجز طاولتك", "اسمك، التاريخ، وعدد الأشخاص.", new[] { "الاسم", "التاريخ", "عدد الأشخاص" }, "تأكيد الحجز"),
            MakeFooter()
        };
        return ("مطعم", comps);
    }

    private static (string, List<UiComponent>) BuildLanding(string text, string lower)
    {
        var wantsForm = ContainsAny(lower, "form", "نموذج", "تواصل", "contact", "تسجيل");
        var wantsFeatures = ContainsAny(lower, "feature", "مميزات", "خدمات", "لماذا");
        var heroTitle = ExtractTitle(text, GuessHeroFromRequest(text));
        var brand = ContainsAny(lower, "شركة", "company") ? "شركتي" : "علامتي";
        var comps = new List<UiComponent>
        {
            MakeNavbar(brand, new[] { "الرئيسية", "المميزات", "التسعير", "تواصل" }, "ابدأ"),
            MakeHero(
                heroTitle,
                $"صفحة مبنية حسب طلبك: {Shorten(text, 90)}",
                "جرّب مجاناً",
                "Custom page")
        };

        if (wantsFeatures || !wantsForm)
            comps.Add(MakeFeatures());

        comps.Add(MakeCards("أبرز النقاط",
        [
            ("مصمّم لطلبك", Shorten(text, 70)),
            ("قابل للتعديل", "عدّل أي قسم من لوحة التحرير."),
            ("ثيم مرن", "Light/Dark وألوانك الخاصة.")
        ]));

        if (wantsForm) comps.Add(MakeForm());
        comps.Add(MakeFooter());
        return (heroTitle.Length > 28 ? "صفحة مخصصة" : heroTitle, comps);
    }

    private static string GuessHeroFromRequest(string text)
    {
        // Don't use layout instructions as a hero headline
        if (LooksLikeCustomLayout(text.ToLowerInvariant()))
            return "مرحباً بك";

        var cleaned = Regex.Replace(text.Trim(),
            @"^(?:اعمل|اعملي|أريد|ابني|بني|بدي|ممكن|الرجاء|please|make|build|create|حط|حطي)\s+",
            "", RegexOptions.IgnoreCase);
        cleaned = Regex.Replace(cleaned, @"^(?:لي|لي |صفحة|page)\s*", "", RegexOptions.IgnoreCase);
        cleaned = cleaned.Trim(' ', '،', '.', '?', '؟');
        if (cleaned.Length is >= 4 and <= 48) return cleaned;
        if (cleaned.Length > 48) return cleaned[..48].Trim() + "…";
        return "صفحة مخصصة حسب طلبك";
    }

    private static UiPage RefinePage(UiPage page, string lower, string original)
    {
        var comps = page.Components.Select(c => c).ToList();

        if (ContainsAny(lower, "footer", "فوتر", "تذييل") && comps.All(c => c.Type != "footer"))
            comps.Add(MakeFooter());

        if (ContainsAny(lower, "form", "نموذج", "تواصل") && comps.All(c => c.Type != "form"))
            comps.Add(MakeForm());

        if (ContainsAny(lower, "login", "تسجيل دخول") && comps.All(c => c.Type != "login"))
            comps.Insert(1, MakeLogin());

        if (ContainsAny(lower, "بوست", "feed", "منشور") && comps.All(c => c.Type != "feed"))
            comps.Add(MakeFeed());

        if (ContainsAny(lower, "بروفايل", "profile", "ملف") && comps.All(c => c.Type != "profile"))
            comps.Insert(Math.Min(1, comps.Count), MakeProfile());

        if (ContainsAny(lower, "stats", "احصا", "إحصا", "أرقام") && comps.All(c => c.Type != "stats"))
            comps.Insert(Math.Min(2, comps.Count), MakeStats());

        if (ContainsAny(lower, "features", "مميزات") && comps.All(c => c.Type != "features"))
            comps.Insert(Math.Min(2, comps.Count), MakeFeatures());

        for (var i = 0; i < comps.Count; i++)
        {
            if (comps[i].Type != "hero") continue;
            var props = new Dictionary<string, object?>(comps[i].Props);
            if (ContainsAny(lower, "عنوان", "title", "هيرو"))
                props["title"] = ExtractTitle(original, props.GetValueOrDefault("title")?.ToString() ?? "عنوان جديد");
            if (ContainsAny(lower, "زر", "button", "cta"))
                props["ctaLabel"] = ExtractQuotedOrFallback(original, props.GetValueOrDefault("ctaLabel")?.ToString() ?? "ابدأ");
            comps[i] = comps[i] with { Props = props };
        }

        return page with { Components = comps };
    }

    private static ThemeTokens ResolveTheme(ThemeTokens current, string lower, PageKind kind)
    {
        var theme = current;

        if (ContainsAny(lower, "dark", "داكن", "ليل", "أسود", "اسود"))
            theme = DefaultTheme.Dark();
        else if (ContainsAny(lower, "light", "فاتح", "نهاري", "ابيض", "أبيض"))
            theme = DefaultTheme.Light();
        else if (kind is PageKind.Social or PageKind.Login)
            theme = DefaultTheme.Light() with
            {
                Primary = "#1877F2",
                Secondary = "#0B5ED7",
                Accent = "#42B72A",
                Background = "#F0F2F5",
                Surface = "#FFFFFF",
                Text = "#1C1E21",
                Muted = "#65676B",
                Border = "#CED0D4"
            };

        return ApplyColorHints(theme, lower);
    }

    private static ThemeTokens ApplyColorHints(ThemeTokens theme, string lower)
    {
        if (ContainsAny(lower, "أزرق", "ازرق", "blue"))
            return theme with { Primary = theme.Mode == "dark" ? "#60A5FA" : "#2563EB", Secondary = theme.Mode == "dark" ? "#93C5FD" : "#1E40AF" };
        if (ContainsAny(lower, "أحمر", "احمر", "red"))
            return theme with { Primary = theme.Mode == "dark" ? "#F87171" : "#DC2626", Accent = "#F59E0B" };
        if (ContainsAny(lower, "أخضر", "اخضر", "green", "teal"))
            return theme with { Primary = theme.Mode == "dark" ? "#34D399" : "#059669" };
        if (ContainsAny(lower, "بنفسج", "purple", "violet"))
            return theme with { Primary = theme.Mode == "dark" ? "#C084FC" : "#7C3AED" };
        return theme;
    }

    private static bool ContainsAny(string haystack, params string[] needles) =>
        needles.Any(n => haystack.Contains(n, StringComparison.OrdinalIgnoreCase));

    private static string ExtractTitle(string text, string fallback)
    {
        var quoted = ExtractQuotedOrFallback(text, "");
        if (!string.IsNullOrWhiteSpace(quoted)) return quoted;

        var m = Regex.Match(text, @"(?:عنوان|اسمها|اسمه|تسمى|called)\s+([^\n\.،,]{3,40})", RegexOptions.IgnoreCase);
        return m.Success ? m.Groups[1].Value.Trim() : fallback;
    }

    private static string ExtractQuotedOrFallback(string text, string fallback)
    {
        var m = Regex.Match(text, "[\"«»“”']([^\"«»“”']{2,60})[\"«»“”']");
        return m.Success ? m.Groups[1].Value.Trim() : fallback;
    }

    private static UiComponent MakeSections(int count, string? lower = null)
    {
        count = Math.Clamp(count, 1, 12);
        var cells = new List<object>();
        for (var i = 1; i <= count; i++)
        {
            // Light defaults cycling text / image / button if user mentioned them
            var kind = "text";
            if (lower is not null)
            {
                if (i == 1 && ContainsAny(lower, "صورة", "image")) kind = "image";
                else if (i == 2 && ContainsAny(lower, "زر", "button")) kind = "button";
                else if (ContainsAny(lower, "صورة") && i == count) kind = "image";
            }

            cells.Add(kind switch
            {
                "image" => new Dictionary<string, object?>
                {
                    ["kind"] = "image",
                    ["alt"] = "صورة",
                    ["caption"] = "اضغط لرفع صورة",
                    ["src"] = ""
                },
                "button" => new Dictionary<string, object?>
                {
                    ["kind"] = "button",
                    ["label"] = "اضغط هنا"
                },
                _ => new Dictionary<string, object?>
                {
                    ["kind"] = "text",
                    ["title"] = $"جزء {i}",
                    ["text"] = "اكتب نصك هنا أو غيّر النوع لصورة/زر"
                }
            });
        }

        return new(
            $"sections-{Guid.NewGuid().ToString("N")[..6]}",
            "sections",
            new Dictionary<string, object?>
            {
                ["title"] = "أقسام",
                ["count"] = count,
                ["cells"] = cells
            });
    }

    private static UiComponent MakeSidebar() => new(
        $"sidebar-{Guid.NewGuid().ToString("N")[..6]}", "sidebar",
        new Dictionary<string, object?>
        {
            ["brand"] = "القائمة",
            ["links"] = new[] { "الرئيسية", "لوحة التحكم", "الطلبات", "الإعدادات", "المساعدة" },
            ["footerNote"] = "Sidebar menu",
            ["collapsed"] = false
        });

    private static UiComponent MakeBurgerMenu() => new(
        $"burger-{Guid.NewGuid().ToString("N")[..6]}", "burgermenu",
        new Dictionary<string, object?>
        {
            ["brand"] = "علامتي",
            ["drawerTitle"] = "القائمة",
            ["links"] = new[] { "الرئيسية", "حول", "الخدمات", "تواصل" },
            ["ctaLabel"] = "ابدأ",
            ["showCta"] = true,
            ["defaultOpen"] = false
        });

    private static UiComponent MakeNavbar(string brand, string[]? links = null, string cta = "ابدأ") => new(
        $"nav-{Guid.NewGuid().ToString("N")[..6]}", "navbar",
        new Dictionary<string, object?>
        {
            ["brand"] = brand,
            ["links"] = links ?? new[] { "الرئيسية", "المميزات", "التسعير", "تواصل" }
        },
        [new UiAction("nav-cta", "scroll", cta, "#hero")]);

    private static UiComponent MakeHero(string title, string subtitle, string cta, string eyebrow) => new(
        $"hero-{Guid.NewGuid().ToString("N")[..6]}", "hero",
        new Dictionary<string, object?>
        {
            ["eyebrow"] = eyebrow,
            ["title"] = title,
            ["subtitle"] = subtitle,
            ["ctaLabel"] = cta,
            ["align"] = "center"
        },
        [new UiAction("hero-cta", "alert", cta, null, "تم تنفيذ الأكشن من الهيرو")]);

    private static UiComponent MakeFeatures() => new(
        $"feat-{Guid.NewGuid().ToString("N")[..6]}", "features",
        new Dictionary<string, object?>
        {
            ["title"] = "مميزات تهمك",
            ["items"] = new object[]
            {
                new { title = "صوت + نص", desc = "احكي أو اكتب المتطلبات بنفس السهولة." },
                new { title = "معاينة حية", desc = "شوف الصفحة تتحدث فوراً في الـ Space." },
                new { title = "ثيم بيلدر", desc = "Light/Dark وألوانك الخاصة." }
            }
        });

    private static UiComponent MakeCards(string title, (string t, string d)[] items) => new(
        $"cards-{Guid.NewGuid().ToString("N")[..6]}", "cards",
        new Dictionary<string, object?>
        {
            ["title"] = title,
            ["items"] = items.Select(i => new { title = i.t, desc = i.d }).ToArray()
        });

    private static UiComponent MakeStats() => new(
        $"stats-{Guid.NewGuid().ToString("N")[..6]}", "stats",
        new Dictionary<string, object?>
        {
            ["source"] = "api",
            ["title"] = "إحصائيات",
            ["items"] = Array.Empty<object>()
        });

    private static UiComponent MakeChart() => new(
        $"chart-{Guid.NewGuid().ToString("N")[..6]}", "chart",
        new Dictionary<string, object?>
        {
            ["source"] = "api",
            ["title"] = "المبيعات"
        });

    private static UiComponent MakeForm(
        string title = "تواصل معنا",
        string subtitle = "اترك رسالتك وسنعود إليك خلال 24 ساعة.",
        string[]? fields = null,
        string submit = "إرسال") => new(
        $"form-{Guid.NewGuid().ToString("N")[..6]}", "form",
        new Dictionary<string, object?>
        {
            ["title"] = title,
            ["subtitle"] = subtitle,
            ["fields"] = fields ?? new[] { "الاسم", "البريد", "الرسالة" },
            ["submitLabel"] = submit
        },
        [new UiAction("form-submit", "alert", submit, null, "تم استلام رسالتك (demo)")]);

    private static UiComponent MakeLogin(
        string title = "تسجيل الدخول",
        string emailLabel = "البريد الإلكتروني",
        bool showSignup = true,
        string? navigateToPageId = null) => new(
        $"login-{Guid.NewGuid().ToString("N")[..6]}", "login",
        new Dictionary<string, object?>
        {
            ["title"] = title,
            ["usernameLabel"] = emailLabel is "البريد الإلكتروني" or "البريد" ? "اسم المستخدم" : emailLabel,
            ["passwordLabel"] = "كلمة المرور",
            ["submitLabel"] = "دخول",
            ["showSignup"] = showSignup,
            ["signupLabel"] = "إنشاء حساب جديد"
        },
        [
            navigateToPageId is null
                ? new UiAction("login-submit", "alert", "دخول", null, "تم تسجيل الدخول (demo)")
                : new UiAction("login-submit", "navigate", "دخول", navigateToPageId, "open-page"),
            new UiAction("login-signup", "alert", "إنشاء حساب", null, "افتح صفحة التسجيل (demo)")
        ]);

    private static UiComponent MakeProfile(
        string name = "مستخدم تجريبي",
        string meta = "المدينة · المهنة",
        string bio = "نبذة قصيرة عن الحساب.",
        string friends = "120",
        string posts = "48",
        string photos = "16") => new(
        $"profile-{Guid.NewGuid().ToString("N")[..6]}", "profile",
        new Dictionary<string, object?>
        {
            ["name"] = name,
            ["meta"] = meta,
            ["bio"] = bio,
            ["friends"] = friends,
            ["posts"] = posts,
            ["photos"] = photos,
            ["coverLabel"] = "صورة الغلاف",
            ["ctaLabel"] = "تعديل الملف"
        },
        [new UiAction("profile-edit", "alert", "تعديل الملف", null, "تعديل البروفايل (demo)")]);

    private static UiComponent MakeFeed(
        (string author, string time, string text, string likes, string comments, string shares)[]? posts = null) => new(
        $"feed-{Guid.NewGuid().ToString("N")[..6]}", "feed",
        new Dictionary<string, object?>
        {
            ["title"] = "المنشورات",
            ["composerPlaceholder"] = "بماذا تفكر؟",
            ["posts"] = (posts ??
            [
                ("أحمد", "الآن", "أول منشور تجريبي 👋", "12", "3", "1"),
                ("ليان", "قبل ساعة", "يوم جميل للعمل والإبداع", "40", "8", "2")
            ]).Select(p => new
            {
                author = p.author,
                time = p.time,
                text = p.text,
                likes = p.likes,
                comments = p.comments,
                shares = p.shares
            }).ToArray()
        },
        [
            new UiAction("feed-post", "alert", "نشر", null, "تم نشر المنشور (demo)"),
            new UiAction("feed-like", "alert", "إعجاب", null, "تم الإعجاب"),
            new UiAction("feed-comment", "alert", "تعليق", null, "افتح التعليقات"),
            new UiAction("feed-share", "alert", "مشاركة", null, "تمت المشاركة")
        ]);

    private static UiComponent MakeCta(string title, string subtitle) => new(
        $"cta-{Guid.NewGuid().ToString("N")[..6]}", "cta",
        new Dictionary<string, object?>
        {
            ["title"] = title,
            ["subtitle"] = subtitle,
            ["buttonLabel"] = "المتابعة"
        },
        [new UiAction("cta-go", "alert", "المتابعة", null, "أكشن الـ CTA شغال")]);

    private static UiComponent MakeSearch() => new(
        $"search-{Guid.NewGuid().ToString("N")[..6]}", "search",
        new Dictionary<string, object?>
        {
            ["title"] = "بحث المستخدمين",
            ["subtitle"] = "تفاعلي مع الـ API — اكتب اسم أو مدينة",
            ["placeholder"] = "ابحث..."
        });

    private static UiComponent MakeColorPicker() => new(
        $"color-{Guid.NewGuid().ToString("N")[..6]}", "colorpicker",
        new Dictionary<string, object?>
        {
            ["title"] = "Color picker",
            ["subtitle"] = "اختاري لون — بينحفظ على السيرفر",
            ["label"] = "اللون",
            ["value"] = "#0F766E"
        });

    private static UiComponent MakeDatePicker() => new(
        $"date-{Guid.NewGuid().ToString("N")[..6]}", "datepicker",
        new Dictionary<string, object?>
        {
            ["title"] = "Date picker",
            ["subtitle"] = "اختاري تاريخ",
            ["label"] = "التاريخ",
            ["value"] = DateTime.UtcNow.ToString("yyyy-MM-dd")
        });

    private static UiComponent MakeTimePicker() => new(
        $"time-{Guid.NewGuid().ToString("N")[..6]}", "timepicker",
        new Dictionary<string, object?>
        {
            ["title"] = "Time picker",
            ["subtitle"] = "اختاري وقت",
            ["label"] = "الوقت",
            ["value"] = "09:30"
        });

    private static UiComponent MakeSingleSelect() => new(
        $"select-{Guid.NewGuid().ToString("N")[..6]}", "select",
        new Dictionary<string, object?>
        {
            ["title"] = "اختيار واحد",
            ["subtitle"] = "Single select — ينحفظ على السيرفر",
            ["placeholder"] = "اختر خياراً",
            ["options"] = new object[]
            {
                new { value = "amman", label = "عمّان" },
                new { value = "irbid", label = "إربد" },
                new { value = "zarqa", label = "الزرقاء" }
            }
        });

    private static UiComponent MakeMultiSelect() => new(
        $"multi-{Guid.NewGuid().ToString("N")[..6]}", "multiselect",
        new Dictionary<string, object?>
        {
            ["title"] = "اختيار متعدد",
            ["subtitle"] = "Multi select — اختاري أكثر من قيمة",
            ["options"] = new object[]
            {
                new { value = "design", label = "تصميم" },
                new { value = "dev", label = "تطوير" },
                new { value = "product", label = "منتج" },
                new { value = "qa", label = "QA" }
            }
        });

    private static UiComponent MakeDropdown() => new(
        $"drop-{Guid.NewGuid().ToString("N")[..6]}", "dropdown",
        new Dictionary<string, object?>
        {
            ["title"] = "دروب داون",
            ["subtitle"] = "قائمة منسدلة متصلة بالـ backend",
            ["placeholder"] = "افتح القائمة",
            ["options"] = new object[]
            {
                new { value = "light", label = "فاتح" },
                new { value = "dark", label = "داكن" },
                new { value = "system", label = "حسب النظام" }
            }
        });

    private static UiComponent MakeUserCard() => new(
        $"user-{Guid.NewGuid().ToString("N")[..6]}", "usercard",
        new Dictionary<string, object?>
        {
            ["userId"] = "u1",
            ["name"] = "سارة خالد",
            ["role"] = "مصممة UI",
            ["city"] = "عمّان",
            ["bio"] = "تحب التصوير والمنتجات الرقمية",
            ["tags"] = new[] { "design", "ui" }
        });

    private static UiComponent MakeFooter(string? text = null) => new(
        $"footer-{Guid.NewGuid().ToString("N")[..6]}", "footer",
        new Dictionary<string, object?>
        {
            ["text"] = text ?? "© 2026 AI UI Builder — صُنع محلياً بـ .NET + React",
            ["links"] = new[] { "خصوصية", "شروط", "تواصل" }
        });

    private static UiPage NormalizePage(UiPage page)
    {
        var comps = page.Components
            .Select((c, i) => c with
            {
                Id = string.IsNullOrWhiteSpace(c.Id) ? $"c-{i + 1}" : c.Id,
                Props = c.Props ?? new Dictionary<string, object?>(),
                Actions = c.Actions ?? []
            })
            .ToList();
        return page with { Components = comps, Theme = page.Theme with { } };
    }

    private static JsonSerializerOptions JsonOpts() => new()
    {
        PropertyNameCaseInsensitive = true,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase
    };
}
