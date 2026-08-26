import { ICommand } from '@/types/command';
import { Logger } from '@/core/logger';

export class CommandManager {
  private static instance: CommandManager;
  private undoStack: ICommand[] = [];
  private redoStack: ICommand[] = [];
  private maxHistory: number = 50;
  private listeners: Set<() => void> = new Set();

  private constructor() {}

  public static getInstance(): CommandManager {
    if (!CommandManager.instance) {
      CommandManager.instance = new CommandManager();
    }
    return CommandManager.instance;
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    this.listeners.forEach((l) => l());
  }

  public execute(command: ICommand): void {
    try {
      command.execute();
      this.undoStack.push(command);
      this.redoStack = []; // Clear redo stack on new action

      if (this.undoStack.length > this.maxHistory) {
        this.undoStack.shift();
      }

      Logger.info('CommandManager', `Executed: ${command.description}`);
      this.notify();
    } catch (err) {
      Logger.error('CommandManager', `Failed executing: ${command.description}`, err);
    }
  }

  public undo(): boolean {
    const command = this.undoStack.pop();
    if (!command) {
      return false;
    }

    try {
      command.undo();
      this.redoStack.push(command);
      Logger.info('CommandManager', `Undone: ${command.description}`);
      this.notify();
      return true;
    } catch (err) {
      Logger.error('CommandManager', `Failed undoing: ${command.description}`, err);
      return false;
    }
  }

  public redo(): boolean {
    const command = this.redoStack.pop();
    if (!command) {
      return false;
    }

    try {
      command.execute();
      this.undoStack.push(command);
      Logger.info('CommandManager', `Redone: ${command.description}`);
      this.notify();
      return true;
    } catch (err) {
      Logger.error('CommandManager', `Failed redoing: ${command.description}`, err);
      return false;
    }
  }

  public canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  public canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  public clear(): void {
    this.undoStack = [];
    this.redoStack = [];
    this.notify();
  }
}

export const commandManager = CommandManager.getInstance();
