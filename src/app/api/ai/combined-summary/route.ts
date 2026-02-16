import { NextResponse } from "next/server";
import OpenAI from "openai";

export const runtime = "nodejs";

type SummaryInput = {
  asset: string;
  position_intent: "ADD" | "HOLD" | "TRIM";
  position_reasons: string[];
  dca_execution: "HEAVY" | "NORMAL" | "LIGHT" | "MINIMUM";
  dca_reasons: string[];
};

const fallbackSentence = (item: SummaryInput) =>
  `${item.asset}: ${item.position_intent} intent with ${item.dca_execution} accumulation framing.`;

const hasForbiddenLanguage = (sentence: string) => {
  return /\b(should|must|recommend|consider|buy|sell|add|trim|increase|decrease|forecast|predict|expect|will|going to)\b/i.test(
    sentence
  );
};

const isValidSentence = (sentence: string, input: SummaryInput) => {
  const trimmed = sentence.trim();
  if (!trimmed) return false;
  if (!trimmed.startsWith(`${input.asset}:`)) return false;
  const sentenceCount = (trimmed.match(/[.!?]/g) ?? []).length;
  if (sentenceCount !== 1) return false;
  if (hasForbiddenLanguage(trimmed)) return false;
  const reasons = [...input.position_reasons, ...input.dca_reasons].filter(Boolean);
  if (!reasons.length) return trimmed === fallbackSentence(input);
  const hasPositionReason = input.position_reasons.some((reason) =>
    trimmed.includes(reason)
  );
  const hasDcaReason = input.dca_reasons.some((reason) => trimmed.includes(reason));
  if (!hasPositionReason || !hasDcaReason) return false;
  return true;
};

export async function POST(request: Request) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "OPENAI_API_KEY is not set." },
        { status: 500 }
      );
    }

    const payload = (await request.json()) as { summaries?: SummaryInput[] };
    const summaries = Array.isArray(payload.summaries) ? payload.summaries : [];
    if (!summaries.length) {
      return NextResponse.json({ summaries: [] });
    }

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.2,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "combined_summary",
          strict: true,
          schema: {
            type: "object",
            properties: {
              summaries: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    asset: { type: "string" },
                    sentence: { type: "string" },
                  },
                  required: ["asset", "sentence"],
                  additionalProperties: false,
                },
              },
            },
            required: ["summaries"],
            additionalProperties: false,
          },
        },
      },
      messages: [
        {
          role: "system",
          content:
            "You synthesize exactly one neutral analyst sentence per asset. " +
            "Do not add new analysis, indicators, or signals. " +
            "No imperatives, no future tense, no forecasts. " +
            "Use only provided reasons.",
        },
        {
          role: "user",
          content: JSON.stringify({
            instructions: {
              format:
                "TICKER: While {position_reason summary}, {dca_reason summary}, resulting in a {position_intent} position with {dca_execution} accumulation.",
            },
            inputs: summaries,
          }),
        },
      ],
    });

    const content = response.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(content) as { summaries?: { asset: string; sentence: string }[] };
    const output = (parsed.summaries ?? []).map((item) => {
      const input = summaries.find((summary) => summary.asset === item.asset);
      const fallback = input ? fallbackSentence(input) : "";
      if (!input) {
        return { asset: item.asset, sentence: item.sentence };
      }
      if (input.position_reasons.length === 0 || input.dca_reasons.length === 0) {
        return { asset: item.asset, sentence: fallback };
      }
      if (!isValidSentence(item.sentence, input)) {
        return { asset: item.asset, sentence: fallback };
      }
      return { asset: item.asset, sentence: item.sentence };
    });

    const fallbackOnly = summaries
      .filter((summary) => !output.find((item) => item.asset === summary.asset))
      .map((summary) => ({ asset: summary.asset, sentence: fallbackSentence(summary) }));

    return NextResponse.json({ summaries: [...output, ...fallbackOnly] });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: "Summary generation failed.", detail: message },
      { status: 500 }
    );
  }
}
