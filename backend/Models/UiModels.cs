namespace AiUiBuilder.Api.Models;

public record ThemeTokens(
    string Mode,
    string Primary,
    string Secondary,
    string Accent,
    string Background,
    string Surface,
    string Text,
    string Muted,
    string Border,
    string Radius,
    string FontFamily
);

public record UiAction(
    string Id,
    string Type,
    string Label,
    string? Target = null,
    string? Payload = null
);

public record UiComponent(
    string Id,
    string Type,
    Dictionary<string, object?> Props,
    List<UiAction>? Actions = null,
    List<UiComponent>? Children = null
);

public record UiPage(
    string Id,
    string Title,
    string Description,
    ThemeTokens Theme,
    List<UiComponent> Components
);

/// <summary>Design space inside a project — has its own pages + chat.</summary>
public record Workspace(
    string Id,
    string Name,
    List<UiPage> Pages,
    string ActivePageId,
    List<ChatMessage> Messages
);

public record ProjectState(
    string Id,
    string Name,
    List<Workspace> Workspaces,
    string ActiveWorkspaceId,
    DateTime UpdatedAt
)
{
    /// <summary>Convenience: active workspace's active page (for older clients).</summary>
    public UiPage Page =>
        ActiveWorkspace().Pages.FirstOrDefault(p => p.Id == ActiveWorkspace().ActivePageId)
        ?? ActiveWorkspace().Pages.First();

    public Workspace ActiveWorkspace() =>
        Workspaces.FirstOrDefault(w => w.Id == ActiveWorkspaceId) ?? Workspaces[0];
}

public record ChatMessage(
    string Role,
    string Content,
    DateTime At
);

public record ChatRequest(
    string? ProjectId,
    string Message,
    UiPage? CurrentPage,
    string? WorkspaceId = null,
    string? PageId = null
);

public record ChatResponse(
    string ProjectId,
    string Reply,
    UiPage Page,
    List<ChatMessage> Messages,
    ProjectState Project
);

public record UpdatePageRequest(UiPage Page, string? WorkspaceId = null);

public record UpdateThemeRequest(ThemeTokens Theme, string? WorkspaceId = null, string? PageId = null);

public record CreateWorkspaceRequest(string? Name = null);

public record RenameWorkspaceRequest(string Name);

public record SetActiveRequest(string? WorkspaceId = null, string? PageId = null);

public record CreatePageRequest(string? Title = null, string? WorkspaceId = null);

public record RenamePageRequest(string Title);

public record ReorderPagesRequest(List<string> PageIds);

public record AgentResult(
    string Reply,
    UiPage Page,
    IReadOnlyList<UiPage>? ExtraPages = null,
    string? FocusPageId = null
);

public static class DefaultTheme
{
    public static ThemeTokens Light() => new(
        Mode: "light",
        Primary: "#0F766E",
        Secondary: "#134E4A",
        Accent: "#F59E0B",
        Background: "#F8FAFC",
        Surface: "#FFFFFF",
        Text: "#0F172A",
        Muted: "#64748B",
        Border: "#E2E8F0",
        Radius: "14px",
        FontFamily: "'IBM Plex Sans Arabic', 'Segoe UI', sans-serif"
    );

    public static ThemeTokens Dark() => new(
        Mode: "dark",
        Primary: "#2DD4BF",
        Secondary: "#99F6E4",
        Accent: "#FBBF24",
        Background: "#0B1220",
        Surface: "#111827",
        Text: "#F8FAFC",
        Muted: "#94A3B8",
        Border: "#1F2937",
        Radius: "14px",
        FontFamily: "'IBM Plex Sans Arabic', 'Segoe UI', sans-serif"
    );
}
