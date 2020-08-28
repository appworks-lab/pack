import { checkAliInternal, getAndExtractTarball, readPackageJSON } from 'ice-npm-utils';
import * as fse from 'fs-extra';
import * as vscode from 'vscode';
import * as path from 'path';
import * as readFiles from 'fs-readdir-recursive';
import axios from 'axios';
import { recordDAU, recordExecuteCommand } from '@iceworks/recorder';
import {
  ALI_GITLABGROUPS_API,
  ALI_GITLABPROJECTS_API,
  ALI_FUSION_MATERIAL_URL,
  ALI_NPM_REGISTRY,
} from '@iceworks/constant';
import * as upperCamelCase from 'uppercamelcase';
import { getTarballURLByMaterielSource, IMaterialPage, IMaterialBlock } from '@iceworks/material-utils';
import { projectPath, getProjectLanguageType, pagesPath } from '@iceworks/project-service';
import { IImportDeclarations, getImportDeclarations } from './utils/getImportDeclarations';
import i18n from './i18n';

// eslint-disable-next-line
const co = require('co');

export const CONFIGURATION_SECTION = 'iceworks';
export const CONFIGURATION_KEY_PCKAGE_MANAGER = 'packageManager';
export const CONFIGURATION_KEY_NPM_REGISTRY = 'npmRegistry';
export const CONFIGURATION_KEY_MATERIAL_SOURCES = 'materialSources';
export const CONFIGURATION_SECTION_PCKAGE_MANAGER = `${CONFIGURATION_SECTION}.${CONFIGURATION_KEY_PCKAGE_MANAGER}`;
export const CONFIGURATION_SECTION_NPM_REGISTRY = `${CONFIGURATION_SECTION}.${CONFIGURATION_KEY_NPM_REGISTRY}`;
export const CONFIGURATION_SETION_MATERIAL_SOURCES = `${CONFIGURATION_SECTION}.${CONFIGURATION_KEY_MATERIAL_SOURCES}`;

let Client;
let defClient;

try {
  /* eslint-disable */
  Client = require('../def-login-client');
  defClient = new Client({
    server: 'http://def.alibaba-inc.com',
  });
} catch {
  console.log('def-login-client is not found');
}

let activeTextEditorId: string;

const { window, Position } = vscode;

export async function checkIsAliInternal(): Promise<boolean> {
  const isAliInternal = await checkAliInternal();
  return isAliInternal;
}

export async function checkPathExists(p: string, folderName?: string): Promise<boolean> {
  if (folderName) {
    p = path.join(p, folderName);
  }
  return await fse.pathExists(p);
}

export function saveDataToSettingJson(section: string, data: any, configurationTarget: boolean = true): void {
  vscode.workspace.getConfiguration(CONFIGURATION_SECTION).update(section, data, configurationTarget);
}

export function getDataFromSettingJson(section: string, defaultValue?: any): any {
  return vscode.workspace.getConfiguration(CONFIGURATION_SECTION).get(section, defaultValue);
}

export function executeCommand(...arg: any[]) {
  // TODO Parameter type judgment
  const reset = arg.length > 2 ? arg.slice(0, arg.length - 2) : arg;
  return vscode.commands.executeCommand.apply(null, reset);
}

export function registerCommand(command: string, callback: (...args: any[]) => any, thisArg?: any) {
  return vscode.commands.registerCommand(
    command,
    (...args) => {
      recordDAU();
      recordExecuteCommand(command);
      callback(...args);
    },
    thisArg
  );
}

export function getPackageManagersDefaultFromPackageJson(packageJsonPath: string): string[] {
  const packageJson = JSON.parse(fse.readFileSync(packageJsonPath, 'utf-8'));
  return packageJson.contributes.configuration.properties[CONFIGURATION_SECTION_PCKAGE_MANAGER].enum;
}

export function getNpmRegistriesDefaultFromPckageJson(packageJsonPath: string): string[] {
  const packageJson = JSON.parse(fse.readFileSync(packageJsonPath, 'utf-8'));
  return packageJson.contributes.configuration.properties[CONFIGURATION_SECTION_NPM_REGISTRY].enum;
}

export async function initExtension(context: vscode.ExtensionContext) {
  const { globalState } = context;

  await autoInitMaterialSource(globalState);

  await autoSetNpmConfiguration(globalState);

  onChangeActiveTextEditor(context);
}

export function onChangeActiveTextEditor(context: vscode.ExtensionContext) {
  vscode.window.onDidChangeActiveTextEditor(
    (editor) => {
      if (editor) {
        const fsPath = editor.document.uri.fsPath;
        const isJSXFile = fsPath.match(/^.*\.(jsx?|tsx)$/g);
        vscode.commands.executeCommand('setContext', 'iceworks:isJSXFile', isJSXFile);

        // save active text editor id
        const { id } = editor as any;
        console.log('activeTextEditor Id', id);
        setLastActiveTextEditorId(id);
      }
    },
    null,
    context.subscriptions
  );
}

export async function autoInitMaterialSource(globalState: vscode.Memento) {
  console.log('autoInitMaterialSource: run');
  const stateKey = 'iceworks.materialSourceIsSet';
  const materialSourceIsSet = globalState.get(stateKey);
  if (!materialSourceIsSet) {
    console.log('autoInitMaterialSource: do');
    const materialSources = getDataFromSettingJson(CONFIGURATION_KEY_MATERIAL_SOURCES);
    // old materialSources and remove it from the previous users
    const officalMaterialSources = [
      'http://ice.alicdn.com/assets/materials/react-materials.json',
      ALI_FUSION_MATERIAL_URL,
    ];
    const newSources = materialSources.filter(
      (materialSource) => !officalMaterialSources.includes(materialSource.source)
    );
    saveDataToSettingJson(CONFIGURATION_KEY_MATERIAL_SOURCES, newSources);
  }

  vscode.workspace.onDidChangeConfiguration(function (event: vscode.ConfigurationChangeEvent) {
    const isTrue = event.affectsConfiguration(CONFIGURATION_KEY_MATERIAL_SOURCES);
    if (isTrue) {
      console.log('autoSetPackageManager: did change');

      globalState.update(stateKey, true);
    }
  });
}

export async function autoSetNpmConfiguration(globalState: vscode.Memento) {
  const isAliInternal = await checkAliInternal();
  autoSetPackageManagerConfiguration(globalState, isAliInternal);
  autoSetNpmRegistryConfiguration(globalState, isAliInternal);
}

async function autoSetPackageManagerConfiguration(globalState: vscode.Memento, isAliInternal: boolean) {
  console.log('autoSetPackageManager: run');

  const stateKey = 'iceworks.packageManagerIsSeted';
  const packageManagerIsSeted = globalState.get(stateKey);
  if (!packageManagerIsSeted && isAliInternal) {
    console.log('autoSetPackageManager: do');
    saveDataToSettingJson(CONFIGURATION_KEY_PCKAGE_MANAGER, 'tnpm');
  }

  vscode.workspace.onDidChangeConfiguration(function (event: vscode.ConfigurationChangeEvent) {
    const isTrue = event.affectsConfiguration(CONFIGURATION_SECTION_PCKAGE_MANAGER);
    if (isTrue) {
      console.log('autoSetPackageManager: did change');

      globalState.update(stateKey, true);
    }
  });
}

async function autoSetNpmRegistryConfiguration(globalState: vscode.Memento, isAliInternal: boolean) {
  console.log('autoSetNpmRegistry: run');

  const stateKey = 'iceworks.npmRegistryIsSeted';
  const npmRegistryIsSeted = globalState.get(stateKey);
  if (!npmRegistryIsSeted && isAliInternal) {
    console.log('autoSetNpmRegistry: do');
    saveDataToSettingJson(CONFIGURATION_KEY_NPM_REGISTRY, ALI_NPM_REGISTRY);
  }

  vscode.workspace.onDidChangeConfiguration(function (event: vscode.ConfigurationChangeEvent) {
    const isTrue = event.affectsConfiguration(CONFIGURATION_SECTION_NPM_REGISTRY);
    if (isTrue) {
      console.log('autoSetNpmRegistry: did change');

      globalState.update(stateKey, true);
    }
  });
}

export function createNpmCommand(action: string, target: string = '', extra: string = ''): string {
  const packageManager = getDataFromSettingJson('packageManager', 'npm');
  let registry = '';
  if (!(packageManager === 'cnpm' || packageManager === 'tnpm' || action === 'run')) {
    registry = ` --registry ${getDataFromSettingJson('npmRegistry', 'https://registry.npm.taobao.org')}`;
  }
  target = target && ` ${target}`;
  extra = extra && ` ${extra}`;
  return `${packageManager} ${action}${target}${registry}${extra}`;
}

export async function getGitLabGroups(token: string) {
  const res = await axios.get(ALI_GITLABGROUPS_API, {
    params: {
      private_token: token,
    },
  });
  console.log('gitLab groups', res.data);
  return res.data;
}

export async function getExistProjects(token: string) {
  const res = await axios.get(ALI_GITLABPROJECTS_API, {
    params: {
      private_token: token,
    },
  });
  console.log('exist projects', res.data);
  return res.data;
}

export function openConfigPanel() {
  vscode.commands.executeCommand('iceworksApp.configHelper.start');
}

export function getLastAcitveTextEditor() {
  const { visibleTextEditors } = window;
  const activeTextEditor = visibleTextEditors.find((item: any) => item.id === activeTextEditorId);
  console.log('window.activeTextEditor:', activeTextEditor);
  return activeTextEditor;
}

export function setLastActiveTextEditorId(id: string) {
  console.log('setLastActiveTextEditorId: run');
  activeTextEditorId = id;
}

export function getImportTemplate(name: string, source: string): string {
  return `import ${name} from '${source}';\n`;
}

export function getTagTemplate(name: string): string {
  return `<${name} /> \n`;
}

interface IImportInfos {
  position: vscode.Position;
  declarations: IImportDeclarations[];
}

export async function getImportInfos(text: string): Promise<IImportInfos> {
  const importDeclarations: IImportDeclarations[] = await getImportDeclarations(text);

  const length = importDeclarations.length;
  let position;
  if (length) {
    position = new Position(importDeclarations[length - 1].loc.end.line, 0);
  } else {
    position = new Position(0, 0);
  }
  return { position, declarations: importDeclarations };
}

export async function getUserInfo() {
  const fn = co.wrap(function* () {
    if (defClient) {
      const user = yield defClient.user();
      return user;
    } else {
      throw new Error('Error: Fail to get user info through def client.');
    }
  });

  // get user info from setting.json
  const userData = getDataFromSettingJson('user') || {};
  const { empId, account, gitlabToken } = userData;

  if (empId && account) {
    return userData;
  } else {
    try {
      const { account, empid: empId } = await fn();
      return { account, empId, gitlabToken };
    } catch (e) {
      throw new Error(e.message);
    }
  }
}

export function getLanguage() {
  return vscode.env.language;
}

export function getIceworksTerminal(terminalName = 'Iceworks') {
  const { terminals } = vscode.window;
  let terminal: vscode.Terminal;
  const targetTerminal = terminals.find((terminal) => terminal.name === terminalName);

  if (targetTerminal) {
    terminal = targetTerminal;
  } else {
    terminal = vscode.window.createTerminal(terminalName);
  }

  return terminal;
}

export const getFileType = (templateSourceSrcPath) => {
  const files = readFiles(templateSourceSrcPath);

  const index = files.findIndex((item) => {
    return /\.ts(x)/.test(item);
  });

  return index >= 0 ? 'ts' : 'js';
};

/**
 * Install template or block dependencies
 */
export const bulkInstallDependencies = async function (pages: IMaterialPage[] | IMaterialBlock[]) {
  const projectPackageJSON = await readPackageJSON(projectPath);

  // get all dependencies from templates
  const pagesDependencies: { [packageName: string]: string } = {};
  pages.forEach(({ dependencies }: any) => Object.assign(pagesDependencies, dependencies));

  // filter existing dependencies of project
  const filterDependencies: { [packageName: string]: string }[] = [];
  Object.keys(pagesDependencies).forEach((packageName) => {
    if (!projectPackageJSON.dependencies.hasOwnProperty(packageName)) {
      filterDependencies.push({
        [packageName]: pagesDependencies[packageName],
      });
    }
  });

  if (filterDependencies.length > 0) {
    const deps = filterDependencies.map((dependency) => {
      const [packageName, version]: [string, string] = Object.entries(dependency)[0];
      return `${packageName}@${version}`;
    });

    const terminal = getIceworksTerminal();
    terminal.show();
    terminal.sendText(`cd '${projectPath}'`, true);
    terminal.sendText(createNpmCommand('install', deps.join(' '), '--save'), true);
  } else {
    return [];
  }
};

// TODO: 如果规定 templates 的类型为 IMaterialPage[] | IMaterialBlock[]
// 则在 368 行会出现不兼容错误 ts 2349.
export const bulkDownload = async function (templates: any, tmpPath: string, log?: (text: string) => void) {
  if (!log) {
    log = (text) => console.log(text);
  }

  return await Promise.all(
    templates.map(async (template: any) => {
      console.log('template', template);
      await fse.mkdirp(pagesPath);
      const templateName: string = upperCamelCase(template.name);

      let tarballURL: string;
      try {
        log(i18n.format('package.common-service.downloadTemplate.getDownloadUrl'));
        tarballURL = await getTarballURLByMaterielSource(template.source);
      } catch (error) {
        error.message = i18n.format('package.common-service.downloadTemplate.downloadError', {
          templateName,
          tarballURL,
        });
        throw error;
      }
      log(i18n.format('package.common-service.downloadTemplate.unzipCode'));
      const downloadPath = path.join(tmpPath, templateName);
      try {
        await getAndExtractTarball(downloadPath, tarballURL, ({ percent }) => {
          log(i18n.format('package.common-service.downloadTemplate.process', { percent: (percent * 100).toFixed(2) }));
        });
      } catch (error) {
        error.message = i18n.format('package.common-service.uzipError', { templateName, tarballURL });
        if (error.code === 'ETIMEDOUT' || error.code === 'ESOCKETTIMEDOUT') {
          error.message = i18n.format('package.common-service.uzipOutTime', { templateName, tarballURL });
        }
        await fse.remove(tmpPath);
        throw error;
      }
    })
  );
};
