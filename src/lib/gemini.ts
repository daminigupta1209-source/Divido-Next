import { Group } from './types';
import { callAi } from './aiProxy';

// Voice → expense parsing. The prompt and response schema live server-side in
// api/scan.js (kind 'voice'); the Gemini key never reaches the client.
export async function parseExpenseWithAI(transcript: string, activeGroup: Group, me: string) {
  const members = Array.isArray(activeGroup.members) ? activeGroup.members : [];

  try {
    return await callAi({ kind: 'voice', transcript, members, me });
  } catch (error) {
    console.error("Gemini AI Parsing Error:", error);
    throw new Error("Failed to understand the expense details. Please try again or fill manually.", { cause: error });
  }
}
