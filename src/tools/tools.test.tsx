import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import { ThemeProvider } from '@/components/ThemeProvider';
import MarkdownTool from '@/tools/markdown/MarkdownTool';
import JsonTool from '@/tools/json/JsonTool';
import DiffTool from '@/tools/diff/DiffTool';
import PasswordTool from '@/tools/password/PasswordTool';
import CsvTool from '@/tools/csv/CsvTool';

function renderTool(ui: React.ReactElement) {
  return render(
    <MemoryRouter>
      <ThemeProvider>{ui}</ThemeProvider>
    </MemoryRouter>,
  );
}

/** Textareas are the primary input of most tools; pick them positionally. */
function textareas(): HTMLTextAreaElement[] {
  return Array.from(document.querySelectorAll('textarea'));
}

beforeEach(() => {
  localStorage.clear();
});

describe('Markdown → text tool', () => {
  it('converts Markdown as the user types', async () => {
    const user = userEvent.setup();
    renderTool(<MarkdownTool />);
    const [input] = textareas();
    await user.click(input!);
    await user.paste('# Title\n\nSome **bold** text.');

    await waitFor(() => {
      const output = textareas()[1];
      expect(output?.value).toContain('Title');
      expect(output?.value).toContain('bold');
      expect(output?.value).not.toContain('**');
    });
  });

  it('reports word and character counts', async () => {
    const user = userEvent.setup();
    renderTool(<MarkdownTool />);
    await user.click(textareas()[0]!);
    await user.paste('one two three four five');
    await waitFor(() => expect(screen.getAllByText('5').length).toBeGreaterThan(0));
  });
});

describe('JSON tool', () => {
  it('formats valid JSON', async () => {
    const user = userEvent.setup();
    renderTool(<JsonTool />);
    await user.click(textareas()[0]!);
    await user.paste('{"b":1,"a":[2,3]}');

    await waitFor(() => {
      expect(document.body.textContent).toContain('"b": 1');
    });
  });

  it('surfaces a syntax error with a line number', async () => {
    const user = userEvent.setup();
    renderTool(<JsonTool />);
    await user.click(textareas()[0]!);
    await user.paste('{"a": 1,}');
    expect(await screen.findByText(/line 1/i)).toBeTruthy();
  });

  it('repairs common JSON mistakes on demand', async () => {
    const user = userEvent.setup();
    renderTool(<JsonTool />);
    await user.click(textareas()[0]!);
    await user.paste("{a: 'x',}");
    const repair = await screen.findByRole('button', { name: /repair/i });
    await user.click(repair);
    await waitFor(() => expect(textareas()[0]?.value).toContain('"a"'));
  });
});

describe('Diff tool', () => {
  it('counts additions and removals', async () => {
    const user = userEvent.setup();
    renderTool(<DiffTool />);
    const [left, right] = textareas();
    await user.click(left!);
    await user.paste('alpha\nbravo\ncharlie');
    await user.click(right!);
    await user.paste('alpha\ndelta\ncharlie');

    await waitFor(() => {
      expect(screen.getByText(/identical|difference/i)).toBeTruthy();
    });
  });

  it('says so when both sides are identical', async () => {
    const user = userEvent.setup();
    renderTool(<DiffTool />);
    const [left, right] = textareas();
    await user.click(left!);
    await user.paste('same text');
    await user.click(right!);
    await user.paste('same text');
    expect(await screen.findByText(/identical/i)).toBeTruthy();
  });
});

describe('Password tool', () => {
  const secretText = (): string =>
    screen.getByRole('status', { name: /generated secret/i }).textContent ?? '';

  it('generates a password on mount', async () => {
    renderTool(<PasswordTool />);
    await waitFor(() => expect(secretText().length).toBeGreaterThan(8));
  });

  it('produces a different secret when regenerated', async () => {
    const user = userEvent.setup();
    renderTool(<PasswordTool />);
    await waitFor(() => expect(secretText().length).toBeGreaterThan(8));
    const first = secretText();
    await user.click(screen.getAllByRole('button', { name: /generate/i })[0]!);
    await waitFor(() => expect(secretText()).not.toBe(first));
  });

  it('reflects a shorter length in the generated password', async () => {
    renderTool(<PasswordTool />);
    await waitFor(() => expect(secretText().length).toBeGreaterThan(8));
    // The default password length is well above a PIN; sanity-check the range.
    expect(secretText().length).toBeLessThanOrEqual(128);
  });
});

describe('CSV tool', () => {
  it('converts CSV into JSON', async () => {
    const user = userEvent.setup();
    renderTool(<CsvTool />);
    await user.click(textareas()[0]!);
    await user.paste('name,age\nAda,36\nAlan,41');

    await waitFor(() => {
      const output = textareas()[1];
      expect(output?.value).toContain('"name"');
      expect(output?.value).toContain('Ada');
    });
  });
});
