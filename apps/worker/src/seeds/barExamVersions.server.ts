import type { BarExamQuestion, BarExamTrack } from "@shotta-doj/shared";

export interface ServerBarExamVersionSeed {
  id: string;
  examTrack: BarExamTrack;
  versionCode: "A" | "B" | "C";
  versionLabel: string;
  title: string;
  description: string;
  totalPoints: number;
  passingScore: number;
  timeLimitMinutes: number;
  candidateInstructionsMarkdown: string;
  questions: BarExamQuestion[];
  reviewerPayload: Record<string, unknown>;
  answerKey: Record<string, unknown> | null;
}

const instructions =
  "You have 24 hours from the moment you start. This exam is open book. Use official Miami Stories legal resources, show your reasoning, cite authority where relevant, and submit only when your final answers are ready. Answers must be written in your own words. Do not use AI to write, rewrite, generate, or complete your answers.";

function questions(track: BarExamTrack, versionCode: "A" | "B" | "C"): BarExamQuestion[] {
  const label = track === "DEFENSE" ? "Defense" : "DOJ";
  return [
    {
      key: `${track}-${versionCode}-q1`,
      kind: "ESSAY",
      points: 25,
      prompt: `${label} Version ${versionCode}: Explain how due process should guide a legal actor when reviewing a contested proceeding.`
    },
    {
      key: `${track}-${versionCode}-q2`,
      kind: "ESSAY",
      points: 25,
      prompt: `${label} Version ${versionCode}: Identify the official Miami Stories resources you would consult and explain how they control the answer.`
    },
    {
      key: `${track}-${versionCode}-q3`,
      kind: "TEXT",
      points: 20,
      prompt: `${label} Version ${versionCode}: Draft a concise professional response to a resident requesting legal guidance.`
    },
    {
      key: `${track}-${versionCode}-q4`,
      kind: "ESSAY",
      points: 30,
      prompt: `${label} Version ${versionCode}: Analyze an ethical or procedural conflict and describe the correct next step under DOJ standards.`
    }
  ];
}

export const barExamVersionSeeds: ServerBarExamVersionSeed[] = (["DOJ", "DEFENSE"] as const).flatMap((track) =>
  (["A", "B", "C"] as const).map((versionCode) => ({
    id: `bar-${track.toLowerCase()}-${versionCode.toLowerCase()}`,
    examTrack: track,
    versionCode,
    versionLabel: `${track}-${versionCode}`,
    title: track === "DEFENSE" ? `Miami Stories Defense Bar Exam - Version ${versionCode}` : `Miami Stories DOJ Bar Exam - Version ${versionCode}`,
    description: "Native DOJ Portal Bar Exam version with candidate-safe prompts and server-side review controls.",
    totalPoints: 100,
    passingScore: 80,
    timeLimitMinutes: 1440,
    candidateInstructionsMarkdown: instructions,
    questions: questions(track, versionCode),
    reviewerPayload: { note: "No committed rubric. Seed official reviewer material privately into D1." },
    answerKey: null
  }))
);
