/**
 * Presentational folder-path input: a controlled text field pre-filled from
 * `defaultFolder`, an inline error message rendered near the field when
 * `error` is set, and a submit action that reports the current field value
 * to its caller. Network calls and error derivation live in `useFolderConfig`;
 * this component only renders props and reports the submitted value.
 */
import { useEffect, useState, type FormEvent } from "react";

interface FolderPathInputProps {
  /** The folder path to prefill the input with (the backend's current watched folder). */
  defaultFolder: string;
  /** An inline error message to display near the input, or null when there is none. */
  error: string | null;
  /** Called with the current input value when the form is submitted. */
  onSubmit: (path: string) => void;
  /** True while a submission is in flight; disables the submit control. */
  submitting?: boolean;
}

/**
 * Renders a controlled absolute-path text input pre-filled with
 * `defaultFolder`, a submit button, and an inline error message below the
 * field when `error` is non-null. Re-syncs its value whenever `defaultFolder`
 * changes (e.g. after the backend prefill resolves or a submission succeeds).
 */
export function FolderPathInput({ defaultFolder, error, onSubmit, submitting }: FolderPathInputProps) {
  const [value, setValue] = useState(defaultFolder);

  useEffect(() => {
    setValue(defaultFolder);
  }, [defaultFolder]);

  /** Prevents the native form submission and reports the current field value. */
  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    onSubmit(value);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2">
      <div className="flex gap-2">
        <label htmlFor="folder-path-input" className="sr-only">
          Watched folder path
        </label>
        <input
          id="folder-path-input"
          type="text"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          className="flex-1 rounded-md bg-glass border border-glass-border px-3 py-2 font-mono text-sm text-text-primary focus:outline-none focus:border-ion focus:ring-1 focus:ring-ion"
        />
        <button
          type="submit"
          disabled={submitting}
          className="rounded-md border border-ion px-3 py-2 text-sm text-ion hover:bg-ion/10 transition-colors disabled:opacity-50"
        >
          {submitting ? "..." : "Set"}
        </button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-400">
          {error}
        </p>
      )}
    </form>
  );
}
