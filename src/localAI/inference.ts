import {
  ODXLocalModel,
  LocalModelConfig
} from './model';

import {
  createEmbedding
} from '../embedding';

import {
  searchInMemory,
  searchKnowledge
} from '../supabase';

import {
  searchOpenKnowledge
} from '../openKnowledge';

export interface LocalInferenceResult {
  success: boolean;
  code: string;
  message: string;
  knowledge: string;
  knowledgeSource: string;
  confidence: number;
}

export class ODXInference {
  private model: ODXLocalModel;

  constructor() {
    const config: LocalModelConfig = {
      modelName: 'odx-brain',
      contextSize: 4096,
      temperature: 0.1
    };

    this.model = new ODXLocalModel(config);
  }

  // ==================================================
  // INITIALIZE
  // ==================================================

  async initialize(): Promise<void> {
    await this.model.load();
  }

  // ==================================================
  // CLEAN TEXT
  // ==================================================

  private cleanText(value: unknown): string {
    if (typeof value !== 'string') {
      return '';
    }

    return value
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .trim();
  }

  // ==================================================
  // CLEAN GENERATED CODE
  // ==================================================

  private cleanGeneratedCode(code: string): string {
    let cleaned = this.cleanText(code);

    if (!cleaned) {
      return '';
    }

    cleaned = cleaned
      .replace(/^```[a-zA-Z0-9_-]*\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();

    const unwantedPrefixes = [
      'Here is the code:',
      'Here\'s the code:',
      'Sure, here is the code:',
      'Sure, here\'s the code:',
      'Code:',
      'Solution:'
    ];

    for (const prefix of unwantedPrefixes) {
      if (
        cleaned
          .toLowerCase()
          .startsWith(prefix.toLowerCase())
      ) {
        cleaned = cleaned
          .slice(prefix.length)
          .trim();
      }
    }

    return cleaned;
  }

  // ==================================================
  // CHECK WHETHER OUTPUT LOOKS LIKE CODE
  // ==================================================

  private looksLikeCode(code: string): boolean {
    const text = this.cleanGeneratedCode(code);

    if (!text) {
      return false;
    }

    if (text.length < 8) {
      return false;
    }

    const codeSignals = [
      'import ',
      'export ',
      'const ',
      'let ',
      'var ',
      'function ',
      'class ',
      'return ',
      '=>',
      'interface ',
      'type ',
      'async ',
      'await ',
      '<',
      '{',
      '}',
      ';'
    ];

    let signalCount = 0;

    for (const signal of codeSignals) {
      if (text.includes(signal)) {
        signalCount++;
      }
    }

    if (signalCount === 0) {
      return false;
    }

    return true;
  }

  // ==================================================
  // FORMAT MEMORY ITEM
  // ==================================================

  private formatMemoryItem(
    item: any
  ): string {
    if (!item) {
      return '';
    }

    const parts: string[] = [];

    const prompt = this.cleanText(
      item.prompt
    );

    const filePath = this.cleanText(
      item.file_path
    );

    const code = this.cleanText(
      item.code_content
    );

    if (prompt) {
      parts.push(
        `Previous task:\n${prompt}`
      );
    }

    if (filePath) {
      parts.push(
        `Previous file:\n${filePath}`
      );
    }

    if (code) {
      parts.push(
        `Previous successful code:\n${code}`
      );
    }

    return parts.join('\n\n');
  }

  // ==================================================
  // FORMAT KNOWLEDGE
  // ==================================================

  private formatKnowledge(
    knowledge: any[]
  ): string {
    if (
      !Array.isArray(knowledge) ||
      knowledge.length === 0
    ) {
      return '';
    }

    return knowledge
      .map(
        (item, index) => {
          const prompt =
            this.cleanText(
              item?.prompt
            );

          const filePath =
            this.cleanText(
              item?.file_path
            );

          const code =
            this.cleanText(
              item?.code_content ||
              item?.content ||
              item?.knowledge
            );

          const parts: string[] = [];

          if (prompt) {
            parts.push(
              `Example ${index + 1} task:\n${prompt}`
            );
          }

          if (filePath) {
            parts.push(
              `Example ${index + 1} file:\n${filePath}`
            );
          }

          if (code) {
            parts.push(
              `Example ${index + 1} solution:\n${code}`
            );
          }

          return parts.join('\n\n');
        }
      )
      .filter(Boolean)
      .join('\n\n====================\n\n');
  }

  // ==================================================
  // FORMAT OPEN KNOWLEDGE
  // ==================================================

  private formatOpenKnowledge(
    results: any[]
  ): string {
    if (
      !Array.isArray(results) ||
      results.length === 0
    ) {
      return '';
    }

    return results
      .map(
        (item) => {
          const title =
            this.cleanText(
              item?.title
            );

          const content =
            this.cleanText(
              item?.content
            );

          const source =
            this.cleanText(
              item?.source
            );

          const url =
            this.cleanText(
              item?.url
            );

          return [
            title
              ? `Title: ${title}`
              : '',
            content
              ? `Content:\n${content}`
              : '',
            source
              ? `Source: ${source}`
              : '',
            url
              ? `URL: ${url}`
              : ''
          ]
            .filter(Boolean)
            .join('\n');
        }
      )
      .filter(Boolean)
      .join(
        '\n\n====================\n\n'
      );
  }

  // ==================================================
  // GENERATE CODE
  // ==================================================

  async generateCode(
    prompt: string,
    geminiApiKey?: string
  ): Promise<LocalInferenceResult> {

    const normalizedPrompt =
      this.cleanText(prompt);

    if (!normalizedPrompt) {
      return {
        success: false,
        code: '',
        message: 'Prompt পাওয়া যায়নি।',
        knowledge: '',
        knowledgeSource: '',
        confidence: 0
      };
    }

    let memoryText = '';
    let knowledgeText = '';
    let knowledgeSource = '';
    let confidence = 0.25;

    // ==================================================
    // 1. ODX MEMORY
    // ==================================================

    if (geminiApiKey) {
      try {
        console.log(
          '🧠 ODX Memory search শুরু...'
        );

        const embedding =
          await createEmbedding(
            normalizedPrompt,
            geminiApiKey
          );

        const memory =
          await searchInMemory(
            embedding
          );

        if (memory) {
          memoryText =
            this.formatMemoryItem(
              memory
            );

          if (memoryText) {
            knowledgeSource =
              'ODX Memory';

            confidence = 0.85;

            console.log(
              '✅ ODX Memory থেকে relevant solution পাওয়া গেছে।'
            );
          }
        }

        // ==================================================
        // 2. ODX KNOWLEDGE
        // ==================================================

        if (!memoryText) {
          console.log(
            '🔎 ODX Memory-তে match নেই। ODX Knowledge search শুরু...'
          );

          const knowledge =
            await searchKnowledge(
              embedding
            );

          knowledgeText =
            this.formatKnowledge(
              knowledge
            );

          if (knowledgeText) {
            knowledgeSource =
              'ODX Knowledge';

            confidence = 0.72;

            console.log(
              '✅ ODX Knowledge থেকে relevant knowledge পাওয়া গেছে।'
            );
          }
        }

      } catch (error) {
        console.log(
          '⚠️ Local memory/knowledge search failed:',
          error
        );
      }
    }

    // ==================================================
    // 3. OPEN KNOWLEDGE
    // ==================================================

    if (
      !memoryText &&
      !knowledgeText
    ) {
      try {
        console.log(
          '🌐 ODX local knowledge পাওয়া যায়নি। Open Knowledge search শুরু...'
        );

        const openResults =
          await searchOpenKnowledge(
            normalizedPrompt
          );

        knowledgeText =
          this.formatOpenKnowledge(
            openResults
          );

        if (knowledgeText) {
          knowledgeSource =
            'Open Knowledge';

          confidence = 0.55;

          console.log(
            `✅ Open Knowledge থেকে ${openResults.length}টি source পাওয়া গেছে।`
          );
        }

      } catch (error) {
        console.error(
          '❌ Open Knowledge search failed:',
          error
        );
      }
    }

    // ==================================================
    // 4. BUILD LOCAL BRAIN CONTEXT
    // ==================================================

    const retrievedContext =
      [
        memoryText
          ? `=== ODX MEMORY ===\n${memoryText}`
          : '',

        knowledgeText
          ? `=== ODX KNOWLEDGE ===\n${knowledgeText}`
          : ''
      ]
        .filter(Boolean)
        .join('\n\n');

    const fullPrompt = `
You are ODX Local Brain.

User request:
${normalizedPrompt}

${retrievedContext
  ? `Retrieved knowledge:\n${retrievedContext}`
  : 'No relevant previous knowledge was found.'
}

Task:
Generate the best code solution for the user request.

Rules:
- Prefer previously successful ODX solutions when they are relevant.
- Reuse proven patterns instead of inventing new architecture.
- Adapt previous solutions to the current request.
- Use retrieved technical knowledge when it is relevant.
- Do not copy unrelated examples.
- Do not invent unnecessary libraries.
- Keep the implementation simple.
- Return ONLY code.
`.trim();

    // ==================================================
    // 5. LOCAL BRAIN GENERATION
    // ==================================================

    try {
      if (!this.model.isLoaded()) {
        await this.model.load();
      }

      console.log(
        '🧠 ODX Local Brain generation শুরু...'
      );

      const result =
        await this.model.generate(
          fullPrompt
        );

      if (
        !result.success ||
        !result.text.trim()
      ) {
        return {
          success: false,
          code: '',
          message:
            'ODX Local Brain কোনো output দিতে পারেনি।',
          knowledge:
            retrievedContext,
          knowledgeSource,
          confidence: 0
        };
      }

      const cleanedCode =
        this.cleanGeneratedCode(
          result.text
        );

      // ==================================================
      // 6. OUTPUT VALIDATION
      // ==================================================

      if (
        !this.looksLikeCode(
          cleanedCode
        )
      ) {
        console.log(
          '⚠️ Local Brain output code-এর মতো valid নয়।'
        );

        return {
          success: false,
          code: '',
          message:
            'ODX Local Brain valid code generate করতে পারেনি।',
          knowledge:
            retrievedContext,
          knowledgeSource,
          confidence: 0
        };
      }

      // Slight confidence boost when actual retrieved
      // successful solution was used.
      if (memoryText) {
        confidence =
          Math.min(
            confidence + 0.05,
            0.95
          );
      } else if (knowledgeText) {
        confidence =
          Math.min(
            confidence + 0.03,
            0.90
          );
      }

      console.log(
        '✅ ODX Local Brain valid code generated.'
      );

      return {
        success: true,
        code: cleanedCode,
        message:
          knowledgeSource
            ? `Local Brain generated code using ${knowledgeSource}.`
            : 'Local Brain generated code using its learned patterns.',
        knowledge:
          retrievedContext,
        knowledgeSource,
        confidence
      };

    } catch (error) {
      console.error(
        '❌ ODX Local Brain error:',
        error
      );

      return {
        success: false,
        code: '',
        message:
          'ODX Local Brain failed.',
        knowledge:
          retrievedContext,
        knowledgeSource,
        confidence: 0
      };
    }
  }

  // ==================================================
  // READY
  // ==================================================

  isReady(): boolean {
    return this.model.isLoaded();
  }

  // ==================================================
  // UNLOAD
  // ==================================================

  unload(): void {
    this.model.unload();
  }
}