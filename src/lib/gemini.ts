import { GoogleGenerativeAI, Schema, SchemaType } from '@google/generative-ai';
import { Group } from './types';

// Initialize the API using the key from environment variables
const apiKey = import.meta.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY || '';
const genAI = new GoogleGenerativeAI(apiKey);

// We define a strict schema to force Gemini to return JSON in our exact format.
const expenseSchema: Schema = {
  type: SchemaType.OBJECT,
  properties: {
    amount: {
      type: SchemaType.NUMBER,
      description: "The total amount of the expense. E.g. for 'Rs 100', return 100.",
    },
    title: {
      type: SchemaType.STRING,
      description: "A short description of what the expense was for, e.g., 'noodles', 'taxi', 'dinner'.",
    },
    payer: {
      type: SchemaType.STRING,
      description: "The name or email of the person who paid. Default to 'ME' if the user says 'I paid'. Otherwise try to match a name from the group.",
    },
    splitMode: {
      type: SchemaType.STRING,
      description: "How the bill is split. Must be one of: 'EQUAL', 'EXACT', 'PERCENTAGE', 'SHARES'. Default to 'EQUAL'.",
    },
    splitters: {
      type: SchemaType.ARRAY,
      items: { type: SchemaType.STRING },
      description: "List of names/emails of people involved in the split. Leave empty if everyone is included.",
    }
  },
  required: ["amount", "title", "payer", "splitMode", "splitters"],
};

export async function parseExpenseWithAI(transcript: string, activeGroup: Group, me: string) {
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is missing');
  }

  // Use the standard pro model
  const model = genAI.getGenerativeModel({
    model: "gemini-flash-latest",
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: expenseSchema,
    }
  });

  // Provide context about the current group so Gemini can map names
  const groupMembersContext = Array.isArray(activeGroup.members) 
    ? activeGroup.members.join(', ')
    : 'No group members';

  const prompt = `
    You are an AI assistant helping to log expenses in a bill-splitting app.
    
    The user is currently logged in as: ${me} (This maps to 'ME' or 'I').
    The current group members are: ${groupMembersContext}.
    
    The user said: "${transcript}"
    
    Extract the expense details. If the user says "I paid", set payer to "${me}".
    If they mention a name, try to match it to one of the group members.
    If they don't mention who paid, assume "${me}".
    If they don't mention how to split, assume "EQUAL".
  `;

  try {
    const result = await model.generateContent(prompt);
    const text = result.response.text();
    return JSON.parse(text);
  } catch (error) {
    console.error("Gemini AI Parsing Error:", error);
    throw new Error("Failed to understand the expense details. Please try again or fill manually.");
  }
}
