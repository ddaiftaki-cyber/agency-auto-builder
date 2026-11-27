import http from "node:http";

const dashboardHTML = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>منشئ المواقع التلقائي | بروجكس</title>
  <style>
    * { box-sizing: border-box; font-family: system-ui, -apple-system, sans-serif; }
    body {
      margin: 0;
      min-height: 100vh;
      background: #0f172a;
      color: #f8fafc;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .card {
      width: 100%;
      max-width: 520px;
      background: #1e293b;
      border: 1px solid #334155;
      border-radius: 16px;
      padding: 28px;
      box-shadow: 0 20px 40px rgba(0, 0, 0, 0.4);
    }
    h1 { margin: 0 0 6px; font-size: 22px; color: #38bdf8; }
    p.sub { margin: 0 0 22px; font-size: 14px; color: #94a3b8; }
    label { display: block; margin-bottom: 6px; font-size: 13px; font-weight: 600; color: #cbd5e1; }
    input, textarea {
      width: 100%;
      padding: 11px 13px;
      margin-bottom: 16px;
      border-radius: 10px;
      border: 1px solid #334155;
      background: #0f172a;
      color: #f8fafc;
      font-size: 14px;
    }
    input:focus, textarea:focus { outline: none; border-color: #38bdf8; }
    .row { display: flex; gap: 12px; }
    .row > div { flex: 1; }
    input[type="color"] { height: 42px; padding: 4px; cursor: pointer; }
    button {
      width: 100%;
      padding: 13px;
      border: none;
      border-radius: 10px;
      background: #2563eb;
      color: #fff;
      font-size: 15px;
      font-weight: 700;
      cursor: pointer;
      transition: background 0.2s;
    }
    button:hover { background: #1d4ed8; }
    button:disabled { background: #475569; cursor: not-allowed; }
    .result {
      margin-top: 20px;
      padding: 14px;
      border-radius: 10px;
      font-size: 14px;
      display: none;
      line-height: 1.7;
    }
    .result.ok { display: block; background: rgba(16, 185, 129, 0.15); border: 1px solid #10b981; color: #6ee7b7; }
    .result.err { display: block; background: rgba(239, 68, 68, 0.15); border: 1px solid #ef4444; color: #fca5a5; }
    .result a { color: #38bdf8; font-weight: 700; text-decoration: underline; }
  </style>
</head>
<body>
  <div class="card">
    <h1>منشئ مواقع العملاء التلقائي</h1>
    <p class="sub">أدخل بيانات المتجر والمنتج لتوليد المحتوى بالذكاء الاصطناعي وإنشاء مستودع الموقع تلقائيًا</p>

    <form id="builderForm">
      <label>اسم المتجر / العلامة التجارية *</label>
      <input type="text" id="clientName" placeholder="مثال: متجر الأناقة" required />

      <label>وصف المنتج أو العرض *</label>
      <textarea id="productDescription" rows="3" placeholder="مثال: ساعات يد رجالية فاخرة مقاومة للماء مع ضمان سنة" required></textarea>

      <div class="row">
        <div>
          <label>السعر</label>
          <input type="text" id="price" placeholder="مثال: 4500 دج" />
        </div>
        <div>
          <label>اللون الأساسي</label>
          <input type="color" id="color" value="#2563eb" />
        </div>
      </div>

      <label>معرّف البكسل (Facebook / TikTok Pixel ID - اختياري)</label>
      <input type="text" id="pixelId" placeholder="مثال: 123456789012345" />

      <button type="submit" id="submitBtn">إنشاء الموقع الآن</button>
    </form>

    <div id="resultBox" class="result"></div>
  </div>

  <script>
    const form = document.getElementById("builderForm");
    const btn = document.getElementById("submitBtn");
    const resBox = document.getElementById("resultBox");

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      btn.disabled = true;
      btn.textContent = "جاري توليد المحتوى وإنشاء المستودع (قد يستغرق 15 ثانية)...";
      resBox.className = "result";
      resBox.style.display = "none";

      try {
        const payload = {
          clientName: document.getElementById("clientName").value.trim(),
          productDescription: document.getElementById("productDescription").value.trim(),
          price: document.getElementById("price").value.trim(),
          color: document.getElementById("color").value,
          pixelId: document.getElementById("pixelId").value.trim(),
        };

        const response = await fetch(window.location.pathname, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        const data = await response.json();

        if (data.success) {
          resBox.className = "result ok";
          resBox.innerHTML =
            "✅ <strong>تم إنشاء موقع العميل بنجاح!</strong><br/>" +
            "• اسم المستودع: <code>" + data.repoName + "</code><br/>" +
            "• النموذج المستخدم: <code>" + data.usedModel + "</code><br/>" +
            "• الرابط على GitHub: <a href='" + data.repoUrl + "' target='_blank'>فتح المستودع</a>";
        } else {
          throw new Error(data.error || "حدث خطأ غير متوقع");
        }
      } catch (err) {
        resBox.className = "result err";
        resBox.innerHTML = "❌ <strong>فشل الإنشاء:</strong> " + err.message;
      } finally {
        btn.disabled = false;
        btn.textContent = "إنشاء الموقع الآن";
      }
    });
  </script>
</body>
</html>`;

const worker = {
  async fetch(request, env) {
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    if (request.method === "GET") {
      return new Response(dashboardHTML, {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "text/html; charset=utf-8" },
      });
    }

    if (request.method !== "POST") {
      return new Response(
        JSON.stringify({ success: false, error: "Method not allowed" }),
        { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    try {
      const body = await request.json();
      const { clientName, productDescription, price, color, pixelId } = body;

      const githubToken = env.GH_TOKEN || env.GITHUB_TOKEN;
      if (!githubToken) {
        throw new Error("Missing GH_TOKEN in environment secrets.");
      }

      const prompt = `Generate JSON only (no markdown) with keys: heroTitle, heroSubtitle, features (array of 4 short Arabic strings) for brand "${clientName}" selling "${productDescription}" at price "${price}".`;

      const models = [
        "gemini-3.8-flash",
        "gemini-2.5-flash-lite",
        "gemini-2.0-flash"
      ];

      let generated = null;
      let usedModel = "fallback-template";

      if (env.GEMINI_API_KEY) {
        for (const model of models) {
          try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 15000);

            const geminiRes = await fetch(
              `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${env.GEMINI_API_KEY}`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                signal: controller.signal,
                body: JSON.stringify({
                  contents: [{ parts: [{ text: prompt }] }],
                  generationConfig: {
                    responseMimeType: "application/json",
                    ...(model.includes("3.8") || model.includes("2.5")
                      ? { thinkingConfig: { thinkingBudget: 0 } }
                      : {})
                  },
                }),
              }
            );
            clearTimeout(timeoutId);

            if (geminiRes.ok) {
              const geminiData = await geminiRes.json();
              const rawText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text;
              if (rawText) {
                generated = JSON.parse(rawText);
                usedModel = model;
                break;
              }
            }
          } catch (_) {
          }
        }
      }

      if (!generated) {
        generated = {
          heroTitle: `${clientName} — جودة تستحق الثقة`,
          heroSubtitle: productDescription || `اكتشف أفضل العروض والمنتجات الحصرية لدى ${clientName} مع خدمة توصيل سريعة والدفع عند الاستلام.`,
          features: [
            "جودة عالية ومضمونة 100%",
            "الدفع نقداً عند الاستلام بكل أمان",
            "توصيل سريع إلى جميع الولايات",
            "خدمة زبائن متوفرة للإجابة على استفساراتكم"
          ]
        };
      }

      const siteConfig = {
        brandName: clientName,
        primaryColor: color || "#2563eb",
        price: price || "",
        pixelId: pixelId || "",
        heroTitle: generated.heroTitle || clientName,
        heroSubtitle: generated.heroSubtitle || productDescription,
        features: Array.isArray(generated.features) ? generated.features : [],
      };

      const slug = "client-" + Date.now().toString(36) + "-" + Math.random().toString(36).substring(2, 6);
      const ghHeaders = {
        Authorization: `Bearer ${githubToken}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "projex-agency-auto-builder",
        "Content-Type": "application/json",
      };

      const repoRes = await fetch(
        "https://api.github.com/repos/ddaiftaki-cyber/digital-agency-website-template-react-tailwind/generate",
        {
          method: "POST",
          headers: ghHeaders,
          body: JSON.stringify({
            owner: "ddaiftaki-cyber",
            name: slug,
            description: `Generated site for ${clientName}`,
            private: false,
          }),
        }
      );

      const repoData = await repoRes.json();
      if (!repoRes.ok) {
        throw new Error(`GitHub generate error: ${repoData.message || JSON.stringify(repoData)}`);
      }

      const fileUrl = `https://api.github.com/repos/ddaiftaki-cyber/${slug}/contents/site-config.json`;
      let fileSha = null;

      for (let attempt = 0; attempt < 8; attempt++) {
        await new Promise((r) => setTimeout(r, 1500));
        const getFileRes = await fetch(fileUrl, { headers: ghHeaders });
        if (getFileRes.ok) {
          const fileInfo = await getFileRes.json();
          if (fileInfo && fileInfo.sha) {
            fileSha = fileInfo.sha;
            break;
          }
        }
      }

      if (!fileSha) {
        throw new Error(`Could not retrieve SHA for site-config.json in ${slug}. Template copy may still be initializing.`);
      }

      const encodedContent = Buffer.from(JSON.stringify(siteConfig, null, 2), "utf8").toString("base64");
      const putRes = await fetch(fileUrl, {
        method: "PUT",
        headers: ghHeaders,
        body: JSON.stringify({
          message: `Configure site for ${clientName}`,
          content: encodedContent,
          sha: fileSha,
        }),
      });

      if (!putRes.ok) {
        const putErr = await putRes.json();
        throw new Error(`GitHub update config error: ${putErr.message || JSON.stringify(putErr)}`);
      }

      return new Response(
        JSON.stringify({
          success: true,
          usedModel,
          repoName: slug,
          repoUrl: repoData.html_url,
          siteConfig,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } catch (err) {
      return new Response(
        JSON.stringify({ success: false, error: err.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  },
};

export default worker;

const port = Number(process.env.PORT) || 3000;

const server = http.createServer(async (req, res) => {
  try {
    const protocol = req.headers["x-forwarded-proto"] || "http";
    const host = req.headers.host || `localhost:${port}`;
    const url = `${protocol}://${host}${req.url}`;

    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    const rawBody = Buffer.concat(chunks);

    const request = new Request(url, {
      method: req.method,
      headers: req.headers,
      body: req.method !== "GET" && req.method !== "HEAD" && rawBody.length > 0 ? rawBody : undefined,
    });

    const response = await worker.fetch(request, process.env);

    res.statusCode = response.status;
    response.headers.forEach((value, key) => {
      res.setHeader(key, value);
    });

    const responseBuffer = Buffer.from(await response.arrayBuffer());
    res.end(responseBuffer);
  } catch (error) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ success: false, error: error.message }));
  }
});

server.listen(port, "0.0.0.0", () => {
  console.log(`Server listening on port ${port}`);
});
