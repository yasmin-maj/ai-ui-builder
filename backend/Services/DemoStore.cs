namespace AiUiBuilder.Api.Services;

public record DemoUser(string Id, string Name, string Role, string City, string Bio, string[] Tags);

public record DemoOption(string Value, string Label);

public record DemoStat(string Label, string Value, string Hint);

public record DemoChartPoint(string Label, int Value);

public record DemoChart(string Title, string Unit, DemoChartPoint[] Points);

public class DemoStore
{
    private readonly List<DemoUser> _users =
    [
        new("u1", "سارة خالد", "مصممة UI", "عمّان", "تحب التصوير والمنتجات الرقمية", ["design", "ui"]),
        new("u2", "أحمد العلي", "مطور .NET", "إربد", "يبني APIs وواجهات تفاعلية", ["dotnet", "api"]),
        new("u3", "نور أبو زيد", "Product Manager", "الزرقاء", "تركّز على تجربة المستخدم", ["product", "ux"]),
        new("u4", "محمد حسن", "Frontend Dev", "عجلون", "React و TypeScript", ["react", "ts"]),
        new("u5", "ليان سمير", "Data Analyst", "السلط", "تحب الأرقام والقصص", ["data", "sql"]),
        new("u6", "كريم يوسف", "QA Engineer", "مادبا", "يكسر الأشياء بلطف", ["qa", "testing"]),
    ];

    private readonly List<DemoOption> _options =
    [
        new("amman", "عمّان"),
        new("irbid", "إربد"),
        new("zarqa", "الزرقاء"),
        new("ajloun", "عجلون"),
        new("salt", "السلط"),
        new("madaba", "مادبا"),
        new("design", "تصميم"),
        new("dev", "تطوير"),
        new("product", "منتج"),
    ];

    private readonly List<object> _events = [];

    public IReadOnlyList<DemoUser> SearchUsers(string? q)
    {
        if (string.IsNullOrWhiteSpace(q)) return _users;
        var term = q.Trim();
        return _users
            .Where(u =>
                u.Name.Contains(term, StringComparison.OrdinalIgnoreCase) ||
                u.Role.Contains(term, StringComparison.OrdinalIgnoreCase) ||
                u.City.Contains(term, StringComparison.OrdinalIgnoreCase) ||
                u.Tags.Any(t => t.Contains(term, StringComparison.OrdinalIgnoreCase)))
            .ToList();
    }

    public DemoUser? GetUser(string id) =>
        _users.FirstOrDefault(u => u.Id.Equals(id, StringComparison.OrdinalIgnoreCase));

    public IReadOnlyList<DemoStat> Stats() =>
    [
        new("مستخدمين", "1,240", "+12%"),
        new("طلبات", "86", "اليوم"),
        new("إيراد", "12.4k", "د.أ"),
        new("نمو", "18%", "هذا الشهر"),
    ];

    public DemoChart Chart() => new(
        "المبيعات",
        "د.أ",
        [
            new("يناير", 42),
            new("فبراير", 58),
            new("مارس", 51),
            new("أبريل", 73),
            new("مايو", 66),
            new("يونيو", 90),
        ]);

    public IReadOnlyList<DemoOption> Options(string? group = null) =>
        string.IsNullOrWhiteSpace(group)
            ? _options
            : _options.Where(o => o.Value.Contains(group, StringComparison.OrdinalIgnoreCase)
                                  || o.Label.Contains(group, StringComparison.OrdinalIgnoreCase)).ToList();

    public object RecordSelection(string kind, object payload)
    {
        var entry = new
        {
            id = Guid.NewGuid().ToString("N")[..8],
            kind,
            payload,
            at = DateTime.UtcNow
        };
        _events.Insert(0, entry);
        if (_events.Count > 50) _events.RemoveAt(_events.Count - 1);
        return entry;
    }

    public IReadOnlyList<object> RecentEvents() => _events.Take(20).ToList();
}
