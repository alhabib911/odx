import * as path from 'path';
import { spawn } from 'child_process';

export interface LocalModelConfig {
  modelName: string;
  contextSize: number;
  temperature: number;
}

export interface LocalModelResponse {
  text: string;
  success: boolean;
}

export class ODXLocalModel {

  private config: LocalModelConfig;
  private loaded = false;

  constructor(
    config: LocalModelConfig
  ) {
    this.config = config;
  }

  private getProjectRoot(): string {
    return path.resolve(
      __dirname,
      '../..'
    );
  }

  private getPythonPath(): string {

    const projectRoot =
      this.getProjectRoot();

    if (
      process.platform === 'win32'
    ) {
      return path.join(
        projectRoot,
        '.venv',
        'Scripts',
        'python.exe'
      );
    }

    return path.join(
      projectRoot,
      '.venv',
      'bin',
      'python'
    );
  }

  private getGenerateScript(): string {

    return path.join(
      this.getProjectRoot(),
      'python',
      'brain',
      'generate.py'
    );
  }

  async load(): Promise<void> {

    const scriptPath =
      this.getGenerateScript();

    const pythonPath =
      this.getPythonPath();

    if (!scriptPath) {
      throw new Error(
        'ODX Brain script পাওয়া যায়নি।'
      );
    }

    if (!pythonPath) {
      throw new Error(
        'ODX Python environment পাওয়া যায়নি।'
      );
    }

    this.loaded = true;
  }

  isLoaded(): boolean {
    return this.loaded;
  }

  async generate(
    prompt: string
  ): Promise<LocalModelResponse> {

    if (!this.loaded) {

      throw new Error(
        'ODX Local Brain এখনো loaded হয়নি।'
      );
    }

    const scriptPath =
      this.getGenerateScript();

    const pythonPath =
      this.getPythonPath();

    const projectRoot =
      this.getProjectRoot();

    return new Promise(
      (
        resolve,
        reject
      ) => {

        const child =
          spawn(
            pythonPath,
            [
              scriptPath,
              prompt
            ],
            {
              cwd: projectRoot,

              stdio: [
                'ignore',
                'pipe',
                'pipe'
              ]
            }
          );

        let output = '';
        let errorOutput = '';

        child.stdout.on(
          'data',
          (data: Buffer) => {
            output +=
              data.toString();
          }
        );

        child.stderr.on(
          'data',
          (data: Buffer) => {
            errorOutput +=
              data.toString();
          }
        );

        child.on(
          'error',
          (error) => {

            reject(
              new Error(
                `ODX Brain Python চালু করা যায়নি: ${error.message}`
              )
            );
          }
        );

        child.on(
          'close',
          (code) => {

            if (code !== 0) {

              reject(
                new Error(
                  errorOutput ||
                  `ODX Brain exited with code ${code}`
                )
              );

              return;
            }

            const text =
              output.trim();

            if (!text) {

              resolve({
                success: false,
                text: ''
              });

              return;
            }

            resolve({
              success: true,
              text
            });
          }
        );
      }
    );
  }

  unload(): void {
    this.loaded = false;
  }
}