import * as vscode from 'vscode';
import * as rimraf from 'rimraf';
import * as fse from 'fs-extra';
import * as util from 'util';
import * as path from 'path';
import latestVersion from 'latest-version';
import { getPackageLocalVersion } from 'ice-npm-utils';
import {
  getDataFromSettingJson,
  createNpmCommand,
  checkPathExists
} from '@iceworks/common-service';
import { dependencyDir } from '@iceworks/project-service';
import executeCommand from '../command/executeCommand';
import { NodeDepTypes, ITerminalMap } from '../types';
import { nodeDepTypes } from '../constants';


const rimrafAsync = util.promisify(rimraf);

class DepNodeProvider implements vscode.TreeDataProvider<DependencyTreeItem> {
  private workspaceRoot: string;

  private extensionContext: vscode.ExtensionContext;

  private onDidChange: vscode.EventEmitter<DependencyTreeItem | undefined> = new vscode.EventEmitter<DependencyTreeItem | undefined>();

  readonly onDidChangeTreeData: vscode.Event<DependencyTreeItem | undefined> = this.onDidChange.event;


  packageJsonPath: string;

  defaultVersion: string;

  constructor(context: vscode.ExtensionContext, workspaceRoot: string) {
    this.extensionContext = context;
    this.workspaceRoot = workspaceRoot;
    this.packageJsonPath = path.join(this.workspaceRoot, 'package.json');
    this.defaultVersion = '-';
  }

  refresh(): void {
    this.onDidChange.fire(undefined);
  }

  getTreeItem(element: DependencyTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: DependencyTreeItem) {
    if (!this.workspaceRoot) {
      return Promise.resolve([]);
    }

    if (element) {
      const { label } = element;
      const deps = this.getDepsInPackageJson(this.packageJsonPath, (label as NodeDepTypes));
      return deps;
    } else {
      return Promise.resolve(
        nodeDepTypes.map(nodeDepType => new DependencyTreeItem(this.extensionContext, nodeDepType, vscode.TreeItemCollapsibleState.Collapsed, nodeDepType)));
    }
  }

  private getDepVersion(moduleName: string): string {
    try {
      const version = getPackageLocalVersion(this.workspaceRoot, moduleName);
      return version;
    } catch (err) {
      return this.defaultVersion;  // when the package version is not found, it shows defaultVersion
    }
  };

  private async getDepsInPackageJson(packageJsonPath: string, label: NodeDepTypes) {
    if (await checkPathExists(packageJsonPath)) {
      const packageJson = JSON.parse(await fse.readFile(packageJsonPath, 'utf-8'));
      const workspaceDir: string = path.dirname(packageJsonPath);

      let deps: DependencyTreeItem[] = [];
      if (packageJson[label]) {
        deps = await Promise.all(Object.keys(packageJson[label]).map(async dep => {
          const version = this.getDepVersion(dep);
          let outdated: boolean;
          if (version === this.defaultVersion) {  // when the package version is defaultVersion, don't show the outdated
            outdated = false;
          } else {
            outdated = await this.getNpmOutdated(dep, version);
          }
          return toDep(this.extensionContext, workspaceDir, dep, version, outdated);
        })
        )
      }

      return deps;
    } else {
      return [];
    }
  }

  private async getNpmOutdated(moduleName: string, version: string) {
    try {
      const latest = await latestVersion(moduleName);
      return version !== latest;
    } catch (err) {
      console.error(err);
      return false;
    };
  };

  public async packageJsonExists() {
    return await checkPathExists(this.packageJsonPath);
  }

  public async getReinstallScript() {
    const workspaceDir: string = path.dirname(this.packageJsonPath);
    const nodeModulesPath = path.join(workspaceDir, 'node_modules');
    if (await checkPathExists(nodeModulesPath)) {
      await rimrafAsync(nodeModulesPath);
    }
    const npmCommand = createNpmCommand('install');
    const command: vscode.Command = {
      command: 'iceworksApp.nodeDependencies.reinstall',
      title: 'Reinstall Dependencies',
      arguments: [workspaceDir, npmCommand]
    };
    return command;
  }

  public getAddDependencyScript(depType: NodeDepTypes, packageName: string) {
    const workspaceDir: string = path.dirname(this.packageJsonPath);
    const packageManager = getDataFromSettingJson('packageManager');
    const isYarn = packageManager === 'yarn';
    const isDevDep = depType === 'devDependencies';
    const npmCommandAction = isYarn ? 'add' : 'install';

    let extraAction = '';
    if (isDevDep) {
      extraAction = '-D'
    } else if (isYarn) {
      extraAction = '-S'
    }
    const npmCommand = createNpmCommand(npmCommandAction, packageName, extraAction);
    const command: vscode.Command = {
      command: 'iceworksApp.nodeDependencies.addDepsAndDevDeps',
      title: 'Add Dependency',
      arguments: [workspaceDir, npmCommand]
    };
    return command;
  }
}

class DependencyTreeItem extends vscode.TreeItem {
  constructor(
    public readonly extensionContext: vscode.ExtensionContext,
    public readonly label: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly id: string,
    public readonly command?: vscode.Command,
    public readonly version?: string,
    public readonly outDated?: boolean
  ) {
    super(label, collapsibleState);
    this.id = id;
  }

  get description(): string {
    return this.version ? this.version : '';
  }

  get contextValue(): string {
    if (this.version) {
      return this.outDated ? 'outdatedDependency' : 'dependency'
    } else {
      return this.label
    }
  }

  iconPath = {
    dark: vscode.Uri.file(this.extensionContext.asAbsolutePath(`assets/dark/${this.version ? 'dependency' : 'dependency-entry'}.svg`)),
    light: vscode.Uri.file(this.extensionContext.asAbsolutePath(`assets/light/${this.version ? 'dependency' : 'dependency-entry'}.svg`))
  };
}

export function createNodeDependenciesTreeProvider(context, rootPath, terminals) {
  const nodeDependenciesProvider = new DepNodeProvider(context, rootPath);
  vscode.window.registerTreeDataProvider('nodeDependencies', nodeDependenciesProvider);
  vscode.commands.registerCommand('iceworksApp.nodeDependencies.refresh', () => nodeDependenciesProvider.refresh());
  vscode.commands.registerCommand('iceworksApp.nodeDependencies.upgrade', (node: DependencyTreeItem) => {
    if (node.command)
      executeCommand(terminals, node.command, node.id);
  });
  vscode.commands.registerCommand('iceworksApp.nodeDependencies.reinstall', async () => {
    if (await nodeDependenciesProvider.packageJsonExists()) {
      const script = await nodeDependenciesProvider.getReinstallScript();
      executeCommand(terminals, script!);
    }
  });

  context.subscriptions.push(vscode.commands.registerCommand('iceworksApp.nodeDependencies.dependencies.add', () => showDepInputBox(terminals, nodeDependenciesProvider, 'dependencies')));
  context.subscriptions.push(vscode.commands.registerCommand('iceworksApp.nodeDependencies.devDependencies.add', () => showDepInputBox(terminals, nodeDependenciesProvider, 'devDependencies')));
  context.subscriptions.push(vscode.commands.registerCommand('iceworksApp.nodeDependencies.addDepsAndDevDeps', () => addDepCommandHandler(terminals, nodeDependenciesProvider)));

  const pattern = path.join(rootPath, dependencyDir);
  const fileWatcher = vscode.workspace.createFileSystemWatcher(pattern);
  fileWatcher.onDidChange(() => nodeDependenciesProvider.refresh());
  fileWatcher.onDidCreate(() => nodeDependenciesProvider.refresh());
  fileWatcher.onDidDelete(() => nodeDependenciesProvider.refresh());
}

export function addDepCommandHandler(terminals: ITerminalMap, nodeDependenciesInstance: any) {
  const quickPick = vscode.window.createQuickPick();
  quickPick.items = nodeDepTypes.map(label => ({ label, detail: `Install ${label}` }));
  quickPick.onDidChangeSelection(selection => {
    if (selection[0]) {
      showDepInputBox(terminals, nodeDependenciesInstance, selection[0].label as NodeDepTypes)
        .catch(console.error);
    }
  });
  quickPick.onDidHide(() => quickPick.dispose());
  quickPick.show();
};

async function showDepInputBox(terminals: ITerminalMap, nodeDependenciesInstance: any, depType: NodeDepTypes) {
  const result = await vscode.window.showInputBox({
    placeHolder: 'Please input the module name you want to install. For example lodash / loadsh@latest',
  });
  if (!result) {
    return;
  }
  executeCommand(terminals, nodeDependenciesInstance.getAddDependencyScript(depType, result));
}

function toDep(extensionContext: vscode.ExtensionContext, workspaceDir: string, moduleName: string, version: string, outdated: boolean) {
  const packageManager = getDataFromSettingJson('packageManager');
  const isYarn = packageManager === 'yarn';
  const npmCommand = createNpmCommand(isYarn ? 'upgrade' : 'update', moduleName);
  const command = outdated ?
    {
      command: 'iceworksApp.nodeDependencies.upgrade',
      title: 'Upgrade Dependency',
      arguments: [workspaceDir, npmCommand]
    } :
    undefined;
  return new DependencyTreeItem(extensionContext, moduleName, vscode.TreeItemCollapsibleState.None, `dependency-${moduleName}`, command, version, outdated);
};
