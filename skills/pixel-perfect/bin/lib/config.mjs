import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

export function defaultConfig() {
  return {
    version: 1,
    impl_url: null,
    selector: null,
    viewport: { width: null, height: null },
    dev_command: null,
    dev_port: null,
    framework: null,
    thresholds: {
      global_max_mismatch_pct: 2.0,
      pixelmatch_threshold: 0.1,
      text_pixelmatch_threshold: 0.3,
      text_color_deltaE_max: 3.0,
    },
    masks: {
      selectors: ['[data-dynamic]'],
      mask_scrollbar: true,
      mask_carets: true,
    },
    frame_map: {},
  };
}

export function configPath(projectDir) {
  return join(projectDir, '.pixel-perfect', 'pixel-perfect.json');
}

export async function loadConfig(projectDir) {
  try {
    const raw = await readFile(configPath(projectDir), 'utf8');
    return { ...defaultConfig(), ...JSON.parse(raw) };
  } catch (err) {
    if (err.code === 'ENOENT') return defaultConfig();
    throw err;
  }
}

export async function saveConfig(projectDir, cfg) {
  await mkdir(join(projectDir, '.pixel-perfect', 'runs'), { recursive: true });
  await writeFile(configPath(projectDir), JSON.stringify(cfg, null, 2) + '\n', 'utf8');
}
