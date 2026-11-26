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
      return new Response(
        JSON.stringify({ success: false, error: "Method not allowed" }),
        { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    try {
      const body = await request.json();
      const { clientName, productDescription, price, color, pixelId } = body;

      if (!env.GITHUB_TOKEN) {
        throw new Error("Missing GITHUB_TOKEN in Worker secrets.");
      }

      const prompt = `Generate JSON only (no markdown) with keys: heroTitle, heroSubtitle, features (array of 4 short Arabic strings) for brand "${clientName}" selling "${productDescription}" at price "${price}".`;

      // قائمة النماذج بالترتيب (الأساسي ثم البدائل السريعة)
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
                break; // نجح التوليد، نخرج من الحلقة فوراً
              }
            }
          } catch (_) {
            // الانتقال تلقائياً للنموذج التالي عند الضغط أو انتهاء المهلة
          }
        }
      }

      // طبقة الحماية الثالثة: محتوى عربي احترافي مضمون إذا كانت كل النماذج مزدحمة
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

      // 2. جلب SHA الخاص بـ site-config.json مع إعادة المحاولة حتى يجهز المستودع
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

      // 3. تحديث site-config.json ببيانات العميل
      const encodedContent = btoa(unescape(encodeURIComponent(JSON.stringify(siteConfig, null, 2))));
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
