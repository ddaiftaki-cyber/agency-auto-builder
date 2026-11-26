export default {
  async fetch(request, env) {
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    if (request.method !== "POST") {
      return new Response(JSON.stringify({ success: false, error: "Method not allowed" }), {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    try {
      const body = await request.json();
      const { clientName, productDescription, price, color, pixelId } = body;

      if (!env.GEMINI_API_KEY || !env.GITHUB_TOKEN) {
        throw new Error("Missing GEMINI_API_KEY or GITHUB_TOKEN in Worker secrets.");
      }

      const prompt = `Generate JSON only (no markdown) with keys: heroTitle, heroSubtitle, features (array of 4 short Arabic strings) for brand "${clientName}" selling "${productDescription}" at price "${price}".`;

      const geminiRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${env.GEMINI_API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: "application/json" },
          }),
        }
      );

      const geminiData = await geminiRes.json();

      if (!geminiRes.ok || !geminiData.candidates || !geminiData.candidates[0]) {
        throw new Error(
          `Gemini API error: ${geminiData.error?.message || JSON.stringify(geminiData)}`
        );
      }

      const rawText = geminiData.candidates[0].content.parts[0].text;
      const generated = JSON.parse(rawText);

      const siteConfig = {
        brandName: clientName,
        primaryColor: color || "#2563eb",
        price: price || "",
        pixelId: pixelId || "",
        heroTitle: generated.heroTitle || clientName,
        heroSubtitle: generated.heroSubtitle || productDescription,
        features: Array.isArray(generated.features) ? generated.features : [],
      };

      const slug =
        "client-" +
        Date.now().toString(36) +
        "-" +
        Math.random().toString(36).substring(2, 6);

      const ghHeaders = {
        Authorization: `Bearer ${env.GITHUB_TOKEN}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "projex-agency-auto-builder",
        "Content-Type": "application/json",
      };

      // 1. إنشاء مستودع جديد من القالب
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

      // انتظار 2.5 ثانية حتى يكتمل نسخ ملفات القالب
      await new Promise((r) => setTimeout(r, 2500));

      // 2. جلب SHA الخاص بـ site-config.json
      const fileUrl = `https://api.github.com/repos/ddaiftaki-cyber/${slug}/contents/site-config.json`;
      const getFileRes = await fetch(fileUrl, { headers: ghHeaders });
      const fileInfo = getFileRes.ok ? await getFileRes.json() : null;

      // 3. تحديث site-config.json ببيانات العميل
      const encodedContent = btoa(unescape(encodeURIComponent(JSON.stringify(siteConfig, null, 2))));
      const putRes = await fetch(fileUrl, {
        method: "PUT",
        headers: ghHeaders,
        body: JSON.stringify({
          message: `Configure site for ${clientName}`,
          content: encodedContent,
          ...(fileInfo?.sha ? { sha: fileInfo.sha } : {}),
        }),
      });

      if (!putRes.ok) {
        const putErr = await putRes.json();
        throw new Error(`GitHub update config error: ${putErr.message || JSON.stringify(putErr)}`);
      }

      return new Response(
        JSON.stringify({
          success: true,
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
