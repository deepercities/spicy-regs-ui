import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Card } from './Card';

describe('Card', () => {
  it('renders default variant with .card class', () => {
    render(<Card>hello</Card>);
    expect(screen.getByText('hello').className).toContain('card');
    expect(screen.getByText('hello').className).not.toContain('card-gradient');
  });

  it('renders gradient variant with .card-gradient class', () => {
    render(<Card variant="gradient">grad</Card>);
    expect(screen.getByText('grad').className).toContain('card-gradient');
  });

  it('renders post variant with .docket-post class', () => {
    render(<Card variant="post">postcard</Card>);
    expect(screen.getByText('postcard').className).toContain('docket-post');
  });

  it('forwards the card classes to its child when asChild is set', () => {
    render(
      <Card asChild variant="gradient" className="extra">
        <a href="/foo">link card</a>
      </Card>,
    );
    const link = screen.getByText('link card');
    expect(link.tagName).toBe('A');
    expect(link.getAttribute('href')).toBe('/foo');
    expect(link.className).toContain('card-gradient');
    expect(link.className).toContain('extra');
  });
});
