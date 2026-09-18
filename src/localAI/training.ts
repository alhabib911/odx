import { spawn } from 'child_process';
import * as path from 'path';

export interface TrainingData {
  prompt: string;
  knowledge: string;
  solution: string;
}

function getProjectRoot(): string {
  return path.resolve(__dirname, '../..');
}

function getPythonPath(): string {
  const projectRoot = getProjectRoot();

  if (process.platform === 'win32') {
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

function runPython(
  scriptPath: string
): Promise<{
  success: boolean;
  output: string;
  error: string;
}> {

  const projectRoot =
    getProjectRoot();

  const pythonPath =
    getPythonPath();

  return new Promise((resolve) => {

    const python = spawn(
      pythonPath,
      [scriptPath],
      {
        cwd: projectRoot,
        stdio: [
          'pipe',
          'pipe',
          'pipe'
        ]
      }
    );

    let output = '';
    let error = '';

    python.stdout.on(
      'data',
      (chunk: Buffer) => {
        output += chunk.toString();
      }
    );

    python.stderr.on(
      'data',
      (chunk: Buffer) => {
        error += chunk.toString();
      }
    );

    python.on(
      'error',
      (err) => {

        console.error(
          'ODX Python Error:',
          err
        );

        resolve({
          success: false,
          output,
          error: err.message
        });
      }
    );

    python.on(
      'close',
      (code) => {

        resolve({
          success: code === 0,
          output,
          error
        });
      }
    );

    python.stdin.end();
  });
}

async function prepareBrainDataset(): Promise<boolean> {

  const scriptPath =
    path.join(
      getProjectRoot(),
      'python',
      'brain',
      'trainer.py'
    );

  const result =
    await runPython(scriptPath);

  if (!result.success) {

    console.error(
      'ODX Dataset Error:',
      result.error
    );

    return false;
  }

  console.log(
    result.output
  );

  return true;
}

async function retrainBrain(): Promise<boolean> {

  const scriptPath =
    path.join(
      getProjectRoot(),
      'python',
      'brain',
      'train.py'
    );

  const result =
    await runPython(scriptPath);

  if (!result.success) {

    console.error(
      'ODX Brain Training Error:',
      result.error
    );

    return false;
  }

  console.log(
    result.output
  );

  return (
    result.output.includes(
      'ODX Brain training completed'
    )
  );
}

export async function saveTrainingData(
  data: TrainingData
): Promise<boolean> {

  const projectRoot =
    getProjectRoot();

  const scriptPath =
    path.join(
      projectRoot,
      'python',
      'brain',
      'dataset.py'
    );

  const pythonPath =
    getPythonPath();

  const saved =
    await new Promise<boolean>(
      (resolve) => {

        const python =
          spawn(
            pythonPath,
            [scriptPath],
            {
              cwd: projectRoot,

              stdio: [
                'pipe',
                'pipe',
                'pipe'
              ]
            }
          );

        let output = '';
        let error = '';

        python.stdout.on(
          'data',
          (chunk: Buffer) => {
            output +=
              chunk.toString();
          }
        );

        python.stderr.on(
          'data',
          (chunk: Buffer) => {
            error +=
              chunk.toString();
          }
        );

        python.on(
          'error',
          (err) => {

            console.error(
              'ODX Training Python Error:',
              err
            );

            resolve(false);
          }
        );

        python.on(
          'close',
          (code) => {

            if (code !== 0) {

              console.error(
                'ODX Training Error:',
                error
              );

              resolve(false);
              return;
            }

            console.log(output);

            resolve(
              output.includes(
                'ODX Training: sample added.'
              )
            );
          }
        );

        python.stdin.write(
          JSON.stringify(data) + '\n'
        );

        python.stdin.end();
      }
    );

  if (!saved) {
    return false;
  }

  console.log(
    '🧠 ODX Brain dataset preparing...'
  );

  const datasetReady =
    await prepareBrainDataset();

  if (!datasetReady) {
    return true;
  }

  console.log(
    '🧠 ODX Brain retraining...'
  );

  await retrainBrain();

  return true;
}