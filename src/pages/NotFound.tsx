import { Link } from 'react-router-dom';
import { FileQuestion } from 'lucide-react';
import { TOOLS } from '@/tools/registry';
import { useDocumentMeta } from '@/components/meta';

export default function NotFoundPage(): React.ReactElement {
  useDocumentMeta({ title: 'Page not found', description: 'That page does not exist.' });

  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center px-4 py-20 text-center">
      <FileQuestion size={44} className="muted opacity-40" aria-hidden />
      <h1 className="mt-4 text-2xl font-bold">That page does not exist</h1>
      <p className="muted mt-2 text-sm">
        The URL may be mistyped, or the tool may have been renamed. Here is everything available:
      </p>
      <ul className="mt-6 grid w-full gap-2 text-left sm:grid-cols-2">
        {TOOLS.map((tool) => (
          <li key={tool.slug}>
            <Link
              to={`/tools/${tool.slug}`}
              className="card flex items-center gap-2.5 p-3 text-sm hover:shadow-md"
            >
              <tool.icon size={16} className="muted shrink-0" aria-hidden />
              <span className="truncate">{tool.name}</span>
            </Link>
          </li>
        ))}
      </ul>
      <Link to="/" className="btn btn-primary mt-6">
        Back to the home page
      </Link>
    </div>
  );
}
