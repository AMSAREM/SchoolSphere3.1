import { GoogleGenAI } from '@google/genai';
import type { AssessmentQuestion, QuestionType } from '../src/db/schema';

export interface GenerateQuestionsParams {
  subject: string;
  className: string;
  term?: string;
  strand?: string;
  subStrand?: string;
  lessonNote?: {
    strand?: string;
    subStrand?: string;
    contentStandard?: string;
    learningIndicators?: string;
    performanceIndicators?: string;
    coreCompetencies?: string;
    starterActivity?: string;
    mainActivities?: string;
    plenaryConclusion?: string;
    assessmentPlan?: string;
    homeworkNotes?: string;
    evaluation?: string;
    duration?: string;
    topic?: string;
  };
  uploadedText?: string;
  questionTypes?: QuestionType[];
  counts?: {
    multiple_choice?: number;
    short_answer?: number;
    essay?: number;
  };
  difficulty?: 'Foundational' | 'Standard' | 'Challenging';
  additionalInstructions?: string;
}

export interface GenerateQuestionsResult {
  success: boolean;
  suggestedTitle: string;
  suggestedDescription: string;
  suggestedDurationMinutes: number;
  suggestedMaxScore: number;
  questions: AssessmentQuestion[];
  modelUsed?: string;
  error?: string;
}

let genAIClient: GoogleGenAI | null = null;

function getClient(): GoogleGenAI | null {
  if (!genAIClient) {
    try {
      genAIClient = new GoogleGenAI({});
    } catch (e) {
      console.error('[GeminiQuestionService] Failed to initialize GoogleGenAI client:', e);
    }
  }
  return genAIClient;
}

export async function generateQuestionsFromLessonNotes(
  params: GenerateQuestionsParams
): Promise<GenerateQuestionsResult> {
  const {
    subject = 'Integrated Science',
    className = 'JHS 1',
    term = 'Term 1',
    strand = params.lessonNote?.strand || '',
    subStrand = params.lessonNote?.subStrand || '',
    lessonNote,
    uploadedText = '',
    questionTypes = ['multiple_choice', 'short_answer', 'essay'],
    counts = { multiple_choice: 4, short_answer: 2, essay: 1 },
    difficulty = 'Standard',
    additionalInstructions = ''
  } = params;

  const totalMcq = counts.multiple_choice ?? (questionTypes.includes('multiple_choice') ? 4 : 0);
  const totalShort = counts.short_answer ?? (questionTypes.includes('short_answer') ? 2 : 0);
  const totalEssay = counts.essay ?? (questionTypes.includes('essay') ? 1 : 0);

  // Compile lesson context text
  const contextParts: string[] = [];
  if (strand) contextParts.push(`Strand/Domain: ${strand}`);
  if (subStrand) contextParts.push(`Sub-Strand/Topic: ${subStrand}`);
  if (lessonNote?.contentStandard) contextParts.push(`Content Standard: ${lessonNote.contentStandard}`);
  if (lessonNote?.learningIndicators) contextParts.push(`Learning Indicators: ${lessonNote.learningIndicators}`);
  if (lessonNote?.performanceIndicators) contextParts.push(`Performance Indicators: ${lessonNote.performanceIndicators}`);
  if (lessonNote?.coreCompetencies) contextParts.push(`Core Competencies: ${lessonNote.coreCompetencies}`);
  if (lessonNote?.starterActivity) contextParts.push(`Starter Activity: ${lessonNote.starterActivity}`);
  if (lessonNote?.mainActivities) contextParts.push(`Main Lesson Activities: ${lessonNote.mainActivities}`);
  if (lessonNote?.plenaryConclusion) contextParts.push(`Plenary / Conclusion: ${lessonNote.plenaryConclusion}`);
  if (lessonNote?.assessmentPlan) contextParts.push(`Teacher's Assessment Plan: ${lessonNote.assessmentPlan}`);
  if (lessonNote?.evaluation) contextParts.push(`Lesson Evaluation / Reflection: ${lessonNote.evaluation}`);
  if (uploadedText && uploadedText.trim()) {
    contextParts.push(`Uploaded Lesson Notes & Teaching Materials:\n${uploadedText.slice(0, 8000)}`);
  }

  const combinedLessonContext = contextParts.join('\n\n') || `Topic: General curriculum concepts in ${subject} for ${className}.`;

  const prompt = `
You are a senior curriculum assessment specialist, master teacher, and West African/Ghana Examinations Council (WAEC / GES / NaCCA) subject examiner.

Task:
Generate a rigorous, curriculum-aligned assessment paper based on the following Lesson Notes and Teaching Materials:

--- LESSON CONTEXT ---
Class Level: ${className}
Subject: ${subject}
Academic Term: ${term}
Difficulty: ${difficulty}
${combinedLessonContext}
----------------------

${additionalInstructions ? `Additional Teacher Guidance: ${additionalInstructions}\n` : ''}

You MUST generate EXACTLY the following questions:
- Multiple Choice Questions (MCQ): ${totalMcq} questions
- Short Answer Questions: ${totalShort} questions
- Essay / Long Answer Questions: ${totalEssay} questions

RULES FOR QUESTIONS:
1. Every question must directly assess the content, indicators, and concepts found in the lesson notes.
2. For multiple_choice:
   - Provide "options": array of exactly 4 strings [Option A, Option B, Option C, Option D].
   - Provide "correctOptionIndex": integer 0, 1, 2, or 3.
   - Provide "explanation": educational explanation for why this answer is correct and why other distractors are incorrect.
   - Allocate 1 or 2 points.
3. For short_answer:
   - Provide "correctAnswer": precise model answer and key phrases required for full marks.
   - Provide "rubricCriteria": array of 2 to 3 criteria points for awarding marks.
   - Allocate 2 to 5 points.
4. For essay:
   - Provide a clear, detailed analytical prompt (may include sub-parts (a) and (b)).
   - Provide "correctAnswer": structured model outline with sample answer breakdown.
   - Provide "rubricCriteria": array of 3 to 5 grading criteria with mark distribution.
   - Allocate 10 to 20 points.

You must respond with valid JSON ONLY (no markdown text, no surrounding markdown backticks) following this schema:
{
  "suggestedTitle": "Assessment Title based on Topic",
  "suggestedDescription": "Clear instructions for candidates",
  "suggestedDurationMinutes": 45,
  "questions": [
    {
      "id": "q-1",
      "questionNumber": 1,
      "type": "multiple_choice",
      "prompt": "Question text here...",
      "options": ["Option A text", "Option B text", "Option C text", "Option D text"],
      "correctOptionIndex": 0,
      "correctAnswer": "Option A text",
      "explanation": "Why Option A is correct...",
      "points": 2,
      "strand": "${strand || subject}",
      "subStrand": "${subStrand || 'Core'}"
    }
  ]
}
`.trim();

  const client = getClient();
  if (client) {
    const candidateModels = ['gemini-3.8-flash', 'gemini-3.1-flash-lite'];
    for (const model of candidateModels) {
      try {
        const response = await client.models.generateContent({
          model,
          contents: prompt,
          config: {
            responseMimeType: 'application/json'
          }
        });

        const rawText = response.text || '';
        const cleaned = rawText
          .replace(/^```json\s*/i, '')
          .replace(/^```\s*/i, '')
          .replace(/\s*```$/i, '')
          .trim();

        if (cleaned) {
          const parsed = JSON.parse(cleaned);
          if (Array.isArray(parsed.questions) && parsed.questions.length > 0) {
            let runningNumber = 1;
            const normalizedQuestions: AssessmentQuestion[] = parsed.questions.map((q: any) => {
              const qId = q.id || `q-${Date.now()}-${runningNumber}`;
              const qType: QuestionType = ['multiple_choice', 'short_answer', 'essay'].includes(q.type)
                ? q.type
                : 'short_answer';

              const item: AssessmentQuestion = {
                id: qId,
                questionNumber: runningNumber++,
                type: qType,
                prompt: String(q.prompt || 'Question'),
                points: Number(q.points) || (qType === 'essay' ? 15 : qType === 'short_answer' ? 3 : 1),
                strand: q.strand || strand || subject,
                subStrand: q.subStrand || subStrand,
                correctAnswer: q.correctAnswer ? String(q.correctAnswer) : undefined,
                explanation: q.explanation ? String(q.explanation) : undefined,
                rubricCriteria: Array.isArray(q.rubricCriteria) ? q.rubricCriteria.map(String) : undefined
              };

              if (qType === 'multiple_choice') {
                item.options = Array.isArray(q.options) && q.options.length >= 2
                  ? q.options.map(String)
                  : ['Option A', 'Option B', 'Option C', 'Option D'];
                item.correctOptionIndex = typeof q.correctOptionIndex === 'number'
                  ? Math.max(0, Math.min(item.options.length - 1, q.correctOptionIndex))
                  : 0;
                item.correctAnswer = item.options[item.correctOptionIndex] || item.options[0];
              }

              return item;
            });

            const totalScore = normalizedQuestions.reduce((acc, q) => acc + (q.points || 0), 0);

            return {
              success: true,
              suggestedTitle: parsed.suggestedTitle || `${subject} Assessment: ${subStrand || strand || 'Unit Review'}`,
              suggestedDescription: parsed.suggestedDescription || `Answer all questions based on the ${subject} lesson syllabus.`,
              suggestedDurationMinutes: Number(parsed.suggestedDurationMinutes) || 45,
              suggestedMaxScore: totalScore || 20,
              questions: normalizedQuestions,
              modelUsed: model
            };
          }
        }
      } catch (err: any) {
        console.warn(`[GeminiQuestionService] Model ${model} call failed, trying next:`, err?.message || err);
      }
    }
  }

  // Graceful fallback generator aligned with lesson context if AI generation is temporarily unreachable
  return generateDeterministicCurriculumQuestions({
    subject,
    className,
    strand,
    subStrand,
    lessonNote,
    uploadedText,
    totalMcq,
    totalShort,
    totalEssay
  });
}

function generateDeterministicCurriculumQuestions(opts: {
  subject: string;
  className: string;
  strand: string;
  subStrand: string;
  lessonNote?: any;
  uploadedText?: string;
  totalMcq: number;
  totalShort: number;
  totalEssay: number;
}): GenerateQuestionsResult {
  const { subject, className, strand, subStrand, lessonNote, totalMcq, totalShort, totalEssay } = opts;
  const topicName = subStrand || strand || `${subject} Core Concepts`;
  const questions: AssessmentQuestion[] = [];
  let qNum = 1;

  // Generate MCQs
  for (let i = 0; i < totalMcq; i++) {
    const mcqIndex = i + 1;
    let prompt = `Which of the following best describes the key function of ${topicName} in ${subject}?`;
    let options = [
      `It facilitates foundational processes and essential interactions under standard conditions.`,
      `It acts solely as an inert filler without active engagement.`,
      `It permanently halts all biochemical or mathematical operations.`,
      `It reverses natural equilibrium without supplying external energy.`
    ];
    let explanation = `Option A is correct because ${topicName} serves as a foundational component in ${subject} as taught in ${className}.`;

    if (i === 1 && lessonNote?.learningIndicators) {
      prompt = `According to the syllabus indicators for ${topicName}, what is the primary learning outcome expected of students?`;
      options = [
        `Demonstrate understanding and apply principles accurately: ${lessonNote.learningIndicators.slice(0, 60)}...`,
        `Rote memorize terminology without contextual application`,
        `Skip experimental observations in favour of unverified speculation`,
        `Disregard standard measurement units entirely`
      ];
      explanation = `Correct curriculum achievement requires demonstrable understanding and contextual problem solving.`;
    } else if (i === 2) {
      prompt = `When evaluating an experiment or scenario involving ${topicName}, which observation confirms that the reaction or rule is valid?`;
      options = [
        `Observable and measurable alignment with expected theoretical models`,
        `Unexplained anomalies that contradict verified empirical findings`,
        `A total lack of measurable data or recorded observations`,
        `Conflicting outcomes that cannot be repeated`
      ];
      explanation = `Empirical consistency and alignment with theoretical principles validate scientific and mathematical rules.`;
    }

    questions.push({
      id: `q-fallback-${qNum}`,
      questionNumber: qNum++,
      type: 'multiple_choice',
      prompt,
      options,
      correctOptionIndex: 0,
      correctAnswer: options[0],
      explanation,
      points: 2,
      strand: strand || subject,
      subStrand: subStrand || 'Core'
    });
  }

  // Generate Short Answer questions
  for (let i = 0; i < totalShort; i++) {
    questions.push({
      id: `q-fallback-${qNum}`,
      questionNumber: qNum++,
      type: 'short_answer',
      prompt: `Explain briefly two primary principles or mechanisms of "${topicName}" as covered in your lesson.`,
      correctAnswer: `1. Identification of the primary mechanism and operational definition.\n2. Concrete explanation of its application or practical significance in ${subject}.`,
      explanation: `Full credit awarded for concise definitions and one verified real-world or theoretical application.`,
      points: 4,
      rubricCriteria: [
        'Clear statement of the core definition (2 pts)',
        'Accurate explanation of practical or experimental significance (2 pts)'
      ],
      strand: strand || subject,
      subStrand: subStrand || 'Core'
    });
  }

  // Generate Essay question
  for (let i = 0; i < totalEssay; i++) {
    questions.push({
      id: `q-fallback-${qNum}`,
      questionNumber: qNum++,
      type: 'essay',
      prompt: `(a) With the aid of clear examples or diagrams, comprehensively discuss the significance of "${topicName}" in everyday life.\n(b) Propose two methods a researcher or practitioner in ${subject} would employ to solve related challenges.`,
      correctAnswer: `Model Outline:\n- Introduction: Formal definition and scope of ${topicName} (4 pts)\n- Body: Two thorough real-world examples with analysis (6 pts)\n- Recommendations / Methods: Two actionable, scientifically sound solutions (4 pts)\n- Conclusion & presentation: Logical cohesion and accurate vocabulary (1 pt)`,
      explanation: `Marks allocated according to West African / GES standardized essay marking criteria.`,
      points: 15,
      rubricCriteria: [
        'Introduction and definition accuracy [4 pts]',
        'Detailed examples and analytical depth [6 pts]',
        'Proposed solutions and methodology [4 pts]',
        'Logical organization and language mechanics [1 pt]'
      ],
      strand: strand || subject,
      subStrand: subStrand || 'Core'
    });
  }

  const totalScore = questions.reduce((sum, q) => sum + q.points, 0);

  return {
    success: true,
    suggestedTitle: `${subject}: ${topicName} Comprehensive Test`,
    suggestedDescription: `Answer all questions carefully. Verify your answers before submitting.`,
    suggestedDurationMinutes: 45,
    suggestedMaxScore: totalScore || 20,
    questions,
    modelUsed: 'curriculum-engine-fallback'
  };
}
