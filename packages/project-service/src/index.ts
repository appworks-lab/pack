import * as vscode from 'vscode';
import { downloadAndGenerateProject } from '@iceworks/generate-project';
import { IMaterialScaffold } from '@iceworks/material-utils';
import { checkPathExists } from '@iceworks/common-service';
import * as simpleGit from 'simple-git/promise';
import * as path from 'path';
import axios from 'axios';
import { generatorCreatetaskUrl, generatorTaskResultUrl, GeneratorTaskStatus } from './constant';

export * from './constant';

interface IDEFProjectField {
  empId: string;
  account: string;
  group: string;
  project: string;
  gitlabToken: string;
  scaffold: IMaterialScaffold;
  clientToken: string;
  projectPath: string;
  projectName: string;
}

export function getScaffoldResources(): object[] {
  const materialSources = vscode.workspace.getConfiguration('iceworks').get('materialSources', []);
  return materialSources;
}

export async function getScaffolds(source: string) {
  const response = await axios.get(source);
  return response.data.scaffolds;
}

export async function getProjectPath(): Promise<string> {
  const options: vscode.OpenDialogOptions = {
    canSelectFolders: true,
    canSelectFiles: false,
    canSelectMany: false,
    openLabel: 'Open',
  };
  const selectFolderUri = await vscode.window.showOpenDialog(options);
  const { fsPath } = selectFolderUri[0];
  return fsPath;
}

export async function createProject(data): Promise<string> {
  const { projectPath, projectName, scaffold } = data;
  const projectDir: string = path.join(projectPath, projectName);
  const isProjectDirExists = await checkPathExists(projectDir);
  if (isProjectDirExists) {
    throw new Error(`${projectDir} directory exists!`)
  }
  const { npm, registry, version } = scaffold.source;
  await downloadAndGenerateProject(projectDir, npm, version, registry);
  return projectDir;
}

export async function openLocalProjectFolder(projectDir: string): Promise<void> {
  const isProjectDirExists = await checkPathExists(projectDir);
  if (!isProjectDirExists) {
    throw new Error(`${projectDir} directory doesn't exist!`)
  }
  vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(projectDir), true);
}

export async function CreateDEFProjectAndCloneRepository(DEFProjectField: IDEFProjectField): Promise<string> {
  const { projectPath, projectName, group, project } = DEFProjectField;
  const projectDir = path.join(projectPath, projectName);
  const isProjectDirExists = await checkPathExists(projectDir);
  if (isProjectDirExists) {
    throw new Error(`${projectDir} directory exists!`)
  }
  await createDEFProject(DEFProjectField);
  await cloneRepositoryToLocal(projectDir, group, project);
  return projectDir
}

export async function createDEFProject(DEFProjectField: IDEFProjectField): Promise<void> {
  const { clientToken } = DEFProjectField;
  const response = await generatorCreatetask(DEFProjectField);
  const { data } = response.data;
  const taskId = data.task_id;
  await getGeneratorTaskStatus(taskId, clientToken);
}

async function cloneRepositoryToLocal(projectDir, group, project): Promise<void> {
  const isProjectDirExists = await checkPathExists(projectDir);
  if (isProjectDirExists) {
    throw new Error(`${projectDir} directory exists!`)
  }
  const repoPath = `git@gitlab.alibaba-inc.com:${group}/${project}.git`;
  await simpleGit().clone(repoPath, projectDir)
}

async function generatorCreatetask(field: IDEFProjectField) {
  const { empId, account, group, project, gitlabToken, scaffold, clientToken } = field;
  const { description, source } = scaffold;
  const { npm } = source;
  const response = await axios.post(generatorCreatetaskUrl, {
    group,
    project,
    description,
    trunk: 'master',
    'generator_id': 6,
    'schema_data': {
      npmName: npm
    },
    'gitlab_info': {
      'id': empId,
      'token': gitlabToken,
      name: account,
      'email': `${account}@alibaba-inc.com`
    },
    'emp_id': empId,
    'client_token': clientToken
  });

  if (response.data.error) {
    throw new Error(response.data.error)
  }
  return response;
}

function getGeneratorTaskStatus(taskId: number, clientToken: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const interval = setInterval(async () => {
      try {
        const response = await axios.get(`${generatorTaskResultUrl}/${taskId}`, {
          params: {
            'need_generator': true,
            'client_token': clientToken
          }
        })
        const { data: { status }, error } = response.data;
        if (error) {
          reject(new Error(error))
        }
        if (status !== GeneratorTaskStatus.running && status !== GeneratorTaskStatus.Created) {
          clearInterval(interval);
          if (status === GeneratorTaskStatus.Failed) {
            reject(new Error('Project Create failed'))
          }
          if (status === GeneratorTaskStatus.Timeout) {
            reject(new Error('Project Create timeout'))
          }
          if (status === GeneratorTaskStatus.Success) {
            resolve()
          }
        }
      } catch (error) {
        reject(error)
      }
    }, 1000);
  });
}
