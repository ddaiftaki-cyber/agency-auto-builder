import http from "node:http";

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
      return new Response(
        JSON.stringify({ status: "ok", service: "projex-agency-auto-builder" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
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
