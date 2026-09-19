import { spawn } from 'child_process';
import * as path from 'path';

export interface TrainingData {
  prompt: string;
  knowledge: string;
  solution: string;
}

interface PythonResult {
  success: boolean;
  output: string;
  error: string;
  exitCode: number | null;
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
  scriptPath: string,
  input?: string
): Promise<PythonResult> {
  const projectRoot =
    getProjectRoot();

  const pythonPath =
    getPythonPath();

  return new Promise((resolve) => {
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
          ],
          windowsHide: true
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
          error: err.message,
          exitCode: null
        });
      }
    );

    python.on(
      'close',
      (code) => {
        resolve({
          success: code === 0,
          output,
          error,
          exitCode: code
        });
      }
    );

    if (typeof input === 'string') {
      python.stdin.write(input);
    }

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

  console.log(
    '🧠 ODX Brain dataset preparation শুরু...'
  );

  const result =
    await runPython(
      scriptPath
    );

  if (!result.success) {
    console.error(
      '❌ ODX Dataset Error:',
      result.error ||
        result.output
    );

    return false;
  }

  if (result.output.trim()) {
    console.log(
      result.output.trim()
    );
  }

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

  console.log(
    '🧠 ODX Brain retraining শুরু...'
  );

  const result =
    await runPython(
      scriptPath
    );

  if (!result.success) {
    console.error(
      '❌ ODX Brain Training Error:',
      result.error ||
        result.output
    );

    return false;
  }

  if (result.output.trim()) {
    console.log(
      result.output.trim()
    );
  }

  const output =
    result.output.toLowerCase();

  const completed =
    output.includes(
      'odx brain training completed'
    ) ||
    output.includes(
      'training completed'
    ) ||
    output.includes(
      'model saved'
    ) ||
    output.includes(
      'new model activated'
    ) ||
    output.includes(
      'training finished'
    );

  if (!completed) {
    console.warn(
      '⚠️ Training process exited successfully, but completion marker পাওয়া যায়নি।'
    );

    return false;
  }

  console.log(
    '✅ ODX Brain retraining successful.'
  );

  return true;
}

async function saveDatasetSample(
  data: TrainingData
): Promise<{
  added: boolean;
  duplicate: boolean;
}> {
  const projectRoot =
    getProjectRoot();

  const scriptPath =
    path.join(
      projectRoot,
      'python',
      'brain',
      'dataset.py'
    );

  const payload =
    JSON.stringify(data) + '\n';

  const result =
    await runPython(
      scriptPath,
      payload
    );

  if (!result.success) {
    console.error(
      '❌ ODX Training dataset error:',
      result.error ||
        result.output
    );

    return {
      added: false,
      duplicate: false
    };
  }

  const output =
    result.output.trim();

  if (output) {
    console.log(output);
  }

  const normalizedOutput =
    output.toLowerCase();

  const duplicate =
    normalizedOutput.includes(
      'duplicate'
    ) ||
    normalizedOutput.includes(
      'already exists'
    ) ||
    normalizedOutput.includes(
      'sample skipped'
    ) ||
    normalizedOutput.includes(
      'training skipped'
    );

  const added =
    normalizedOutput.includes(
      'odx training: sample added.'
    ) ||
    normalizedOutput.includes(
      'sample added'
    ) ||
    normalizedOutput.includes(
      'training sample added'
    );

  if (duplicate) {
    console.log(
      '♻️ ODX Training duplicate sample detected. Retraining skipped.'
    );

    return {
      added: false,
      duplicate: true
    };
  }

  if (!added) {
    console.warn(
      '⚠️ Dataset script finished but sample-added status পাওয়া যায়নি। Retraining skipped.'
    );

    return {
      added: false,
      duplicate: false
    };
  }

  console.log(
    '✅ New ODX Training sample added.'
  );

  return {
    added: true,
    duplicate: false
  };
}

function normalizeTrainingData(
  data: TrainingData
): TrainingData {
  return {
    prompt:
      String(
        data.prompt || ''
      ).trim(),

    knowledge:
      String(
        data.knowledge || ''
      ).trim(),

    solution:
      String(
        data.solution || ''
      ).trim()
  };
}

function validateTrainingData(
  data: TrainingData
): boolean {
  if (!data.prompt) {
    console.error(
      '❌ Training data prompt missing.'
    );

    return false;
  }

  if (!data.solution) {
    console.error(
      '❌ Training data solution missing.'
    );

    return false;
  }

  return true;
}

export async function saveTrainingData(
  data: TrainingData
): Promise<boolean> {
  const normalizedData =
    normalizeTrainingData(
      data
    );

  if (
    !validateTrainingData(
      normalizedData
    )
  ) {
    return false;
  }

  console.log(
    '📚 ODX Training: successful solution received.'
  );

  /*
   * ==================================================
   * 1. ADD NEW SAMPLE / CHECK DUPLICATE
   * ==================================================
   */

  const datasetResult =
    await saveDatasetSample(
      normalizedData
    );

  /*
   * Exact / semantic duplicate.
   * No retraining.
   */

  if (datasetResult.duplicate) {
    console.log(
      '🧠 Existing knowledge detected. ODX Brain retraining প্রয়োজন নেই.'
    );

    return true;
  }

  /*
   * Dataset script did not confirm
   * a new sample.
   */

  if (!datasetResult.added) {
    console.warn(
      '⚠️ নতুন training sample নিশ্চিত করা যায়নি। Training বন্ধ রাখা হয়েছে।'
    );

    return false;
  }

  /*
   * ==================================================
   * 2. PREPARE BRAIN DATASET
   * ==================================================
   */

  const datasetReady =
    await prepareBrainDataset();

  if (!datasetReady) {
    console.error(
      '❌ Brain dataset preparation failed. Retraining বন্ধ।'
    );

    return false;
  }

  /*
   * ==================================================
   * 3. RETRAIN LOCAL BRAIN
   * ==================================================
   */

  const trained =
    await retrainBrain();

  if (!trained) {
    console.error(
      '❌ New training sample save হয়েছে, কিন্তু ODX Brain retraining সফল হয়নি।'
    );

    return false;
  }

  /*
   * ==================================================
   * 4. SUCCESS
   * ==================================================
   */

  console.log(
    '✅ ODX Training pipeline completed successfully.'
  );

  return true;
}