import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
        return NextResponse.json(
            { error: "AI description generation is not configured. Set OPENAI_API_KEY in your environment." },
            { status: 503 },
        );
    }

    const body = await req.json().catch(() => null);
    const { title, category, context_hint } = body ?? {};

    if (!title) {
        return NextResponse.json({ error: "title is required" }, { status: 400 });
    }

    const systemPrompt =
        "You are a professional content writer for a streaming platform. " +
        "Write compelling, concise descriptions for video content. " +
        "Use engaging language. Do not include spoilers. Do not use markdown or bullet points.";

    const contextParts: string[] = [`Title: ${title}`];
    if (category) contextParts.push(`Category: ${category}`);
    if (context_hint === "short") {
        contextParts.push(
            "Write a short summary of 1–2 sentences (max 160 characters) suitable for a card or listing preview.",
        );
    } else {
        contextParts.push(
            "Write a full description of 2–4 sentences for the detail page. " +
            "Capture the tone, themes, and appeal of the content.",
        );
    }

    const userPrompt = contextParts.join("\n");

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
            model: "gpt-4o-mini",
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt },
            ],
            max_tokens: 300,
            temperature: 0.7,
        }),
    });

    if (!response.ok) {
        const err = await response.text().catch(() => "");
        return NextResponse.json(
            { error: "AI service returned an error. Please try again." },
            { status: 502 },
        );
    }

    const data = await response.json();
    const description: string = data.choices?.[0]?.message?.content?.trim() ?? "";

    return NextResponse.json({ description });
}
