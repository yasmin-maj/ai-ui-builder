# AI UI Builder

AI agent يبني واجهات من المتطلبات (نص أو صوت) مع معاينة حية، تعديل كمبوننتس، Light/Dark، و Theme Builder.

## Stack

- **Backend:** ASP.NET Core 8 (`backend`)
- **Frontend:** React + Vite + TypeScript (`frontend`)

## تشغيل محلي

### 1) API

```bash
cd backend
dotnet run --launch-profile http
```

يعمل على: `http://localhost:5197`

### 2) Frontend

```bash
cd frontend
npm install
npm run dev
```

يفتح على: `http://localhost:5173`

## OpenAI (اختياري)

بدون مفتاح API يشتغل **Local Agent** (قواعد ذكية للعربي/الإنجليزي).

مع مفتاح:

```json
// backend/appsettings.Development.json
{
  "OpenAI": {
    "ApiKey": "sk-...",
    "Model": "gpt-4o-mini"
  }
}
```

## الميزات

- Chat agent + Voice (Web Speech API)
- Space معاينة حية للصفحة
- مكتبة كمبوننتس جاهزة قابلة للتعديل
- Light / Dark + Theme Builder للألوان
- Actions على الأزرار (alert / scroll / navigate / custom)
