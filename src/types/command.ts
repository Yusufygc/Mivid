export interface ICommand {
  readonly description: string;
  execute(): void;
  undo(): void;
}
