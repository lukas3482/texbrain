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
