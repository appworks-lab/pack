import * as path from 'path';
import getFiles from './getFiles';
import Analyzer from './Analyzer';
import Scanner from './Scanner';
import { IDoctorOptions } from './types/Doctor';
import { IScanOptions, IScannerReports } from './types/Scanner';
import { IFileInfo } from './types/File';

// Ignore directories
const defaultIgnore = [
  '.faas_debug_tmp',
  '.ice',
  '.rax',
  'build',
  'es',
  'dist',
  'lib',
  'mocks',
  'logs',
  'coverage',
  'node_modules',
  'demo',
  'examples',
  'public',
  'test',
  '__tests__',
];

class Doctor {
  private options: IDoctorOptions;

  private ignore: string[];

  private scanner: Scanner;

  private analyzer: Analyzer;

  constructor(options: IDoctorOptions) {
    this.options = options || {};

    this.ignore = defaultIgnore.concat(this.options.ignore || []);

    this.scanner = new Scanner({ ignore: this.ignore });

    this.analyzer = new Analyzer({ ignore: this.ignore });
  }

  scan(directory: string, options?: IScanOptions): Promise<IScannerReports> {
    return this.scanner.scan(path.isAbsolute(directory) ? directory : path.join(process.cwd(), directory), options);
  }

  analyse(directory: string) {
    return this.analyzer.analyse(directory);
  }

  getFiles(directory: string): IFileInfo[] {
    return getFiles(directory, this.ignore);
  }
}

export { Doctor };
