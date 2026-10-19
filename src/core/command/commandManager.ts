import { ICommand } from '@/types/command';
import { Logger } from '@/core/logger';

export class CommandManager {
  private static instance: CommandManager;
  private undoStack: ICommand[] = [];
  private redoStack: ICommand[] = [];
  private maxHistory: number = 100;
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

  /**
   * Records a command whose effect is already applied (the state changed before we heard about it).
   * Used by the timeline history, which observes the store instead of wrapping every action.
   */
  public record(command: ICommand): void {
    this.undoStack.push(command);
    this.redoStack = [];

    if (this.undoStack.length > this.maxHistory) {
      this.undoStack.shift();
    }

    this.notify();
  }

  /** Most recent command on the undo stack, or null */
  public peek(): ICommand | null {
    return this.undoStack.length > 0 ? this.undoStack[this.undoStack.length - 1] : null;
  }

  /** Tells listeners that the top command was modified in place (coalesced edits) */
  public touch(): void {
    this.notify();
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
