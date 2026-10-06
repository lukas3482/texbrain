// the files of a project folder by path, relative to the folder with forward
// slashes, the way the tabs and the compiler name them

export interface ProjectFile {
  path: string;
  size: number;
  modified: number;
}

// hidden folders and node_modules stay out, like in the file tree
export async function listProjectFiles(dir: FileSystemDirectoryHandle, base = ''): Promise<ProjectFile[]> {
  const out: ProjectFile[] = [];
  for await (const entry of dir.values()) {
    const path = base ? `${base}/${entry.name}` : entry.name;
    if (entry.kind === 'directory') {
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
      out.push(...(await listProjectFiles(entry as FileSystemDirectoryHandle, path)));
    } else {
      const file = await (entry as FileSystemFileHandle).getFile();
      out.push({ path, size: file.size, modified: file.lastModified });
    }
  }
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

// a path that came over the socket, checked before it gets near the folder
export function cleanPath(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error('path must be a non-empty string');
  const path = value.trim().replace(/\\/g, '/').replace(/^(\.\/)+/, '');
  if (path.startsWith('/') || /^[a-zA-Z]:/.test(path)) throw new Error(`${value} is not relative to the project folder`);
  if (path.split('/').some((part) => part === '' || part === '.' || part === '..')) {
    throw new Error(`${value} is not a plain path inside the project`);
  }
  return path;
}

async function folderOf(root: FileSystemDirectoryHandle, path: string, create: boolean) {
  const parts = path.split('/');
  const name = parts.pop() as string;
  let dir = root;
  for (const part of parts) dir = await dir.getDirectoryHandle(part, { create });
  return { dir, name };
}

export async function readProjectFile(root: FileSystemDirectoryHandle, path: string): Promise<string> {
  try {
    const { dir, name } = await folderOf(root, path, false);
    const file = await (await dir.getFileHandle(name)).getFile();
    return await file.text();
  } catch (e) {
    if (e instanceof DOMException && (e.name === 'NotFoundError' || e.name === 'TypeMismatchError')) {
      throw new Error(`There is no file ${path} in the project`);
    }
    throw e;
  }
}

// folders on the way are made as needed. says whether the file is new
export async function writeProjectFile(root: FileSystemDirectoryHandle, path: string, text: string): Promise<boolean> {
  const { dir, name } = await folderOf(root, path, true);
  const created = await dir.getFileHandle(name).then(() => false, () => true);
  const writable = await (await dir.getFileHandle(name, { create: true })).createWritable();
  await writable.write(text);
  await writable.close();
  return created;
}
