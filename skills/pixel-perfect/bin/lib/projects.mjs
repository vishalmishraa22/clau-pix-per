import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { dirname } from 'node:path';

async function readRegistry(registryPath) {
  try {
    const raw = await readFile(registryPath, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === 'ENOENT') return { projects: [] };
    throw err;
  }
}

async function writeRegistry(registryPath, data) {
  await mkdir(dirname(registryPath), { recursive: true });
  await writeFile(registryPath, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

export async function registerProject(registryPath, projectDir) {
  const reg = await readRegistry(registryPath);
  if (!reg.projects.includes(projectDir)) {
    reg.projects.push(projectDir);
    await writeRegistry(registryPath, reg);
  }
}

export async function listProjects(registryPath) {
  const reg = await readRegistry(registryPath);
  return reg.projects;
}

export async function forgetMissing(registryPath) {
  const reg = await readRegistry(registryPath);
  const surviving = [];
  for (const p of reg.projects) {
    try {
      await access(p);
      surviving.push(p);
    } catch { /* gone */ }
  }
  reg.projects = surviving;
  await writeRegistry(registryPath, reg);
}
