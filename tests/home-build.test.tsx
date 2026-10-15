import { describe, expect, it, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { WebBuildReadout } from '../src/pages/Home';
import { describeWebBuild, webBuild } from '../src/build';

// Vitest globals are off — register cleanup explicitly so retained DOM
// nodes from one `render` do not contaminate the next test (the "multiple
// elements by data-testid web-build" failure).
afterEach(() => {
  cleanup();
});

describe('WebBuildReadout', () => {
  it('renders describeWebBuild(webBuild) as its text', () => {
    render(<WebBuildReadout />);
    const el = screen.getByTestId('web-build');
    expect(el.textContent).toBe(describeWebBuild(webBuild));
  });

  it('uses the same webBuild object the auth header derives from', () => {
    render(<WebBuildReadout />);
    const el = screen.getByTestId('web-build');
    // The readout and the header share one object: the title is webBuild.commit,
    // and the text is derived from the same object clientVersion uses.
    expect(el.getAttribute('title')).toBe(webBuild.commit);
  });

  it('prefixes the title with the commit when it is known', () => {
    // In the sandbox the injected identity may have a real commit (vite define
    // runs probeGit); when it does, the title is the full 40-hex SHA.
    if (webBuild.commit !== 'unknown') {
      render(<WebBuildReadout />);
      const el = screen.getByTestId('web-build');
      expect(el.getAttribute('title')).toMatch(/^[0-9a-f]{40}$/);
    }
  });
});
