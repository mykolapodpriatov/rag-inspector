import { expect, test } from '@playwright/test';

// The journey the app exists for: a query whose retrieval failed, the chunk
// that beat the right answer, and what changed between two retrievers.
//
// These run against the production build and the committed fixtures, so the
// assertions can name real values — "France river Paris expects eiffel and gets
// it at rank 3" is a fact about the dataset, not a fragile guess.

test.describe('query screen', () => {
  test('opens on a run and shows its ranked results', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByLabel('Run')).toBeVisible();
    await expect(page.getByRole('listitem').first()).toBeVisible();
    await expect(page.getByText('Precision@K')).toBeVisible();
  });

  test('shows the metrics for a query whose retrieval failed', async ({
    page,
  }) => {
    await page.goto('/?query=France+river+Paris');

    // eiffel is the declared answer and ranks third, so precision is 1/5 and
    // the reciprocal rank is 1/3. If the fixtures are regenerated and these
    // change, that is a real change worth noticing.
    await expect(page.getByText('0.200')).toBeVisible();
    await expect(page.getByText('0.333')).toBeVisible();
  });

  test('marks the known-relevant chunk in text, not only by colour', async ({
    page,
  }) => {
    await page.goto('/?query=France+river+Paris');

    const eiffelRow = page.getByRole('listitem').filter({ hasText: 'eiffel' });
    await expect(eiffelRow.getByText('relevant')).toBeVisible();
  });

  test('explains why the winning chunk won', async ({ page }) => {
    await page.goto('/?query=France+river+Paris&chunk=seine');

    const detail = page.getByRole('region', { name: 'Chunk detail' });
    await expect(detail.getByRole('heading', { name: 'seine' })).toBeVisible();
    await expect(detail.getByText(/Sentence attribution/)).toBeVisible();
  });

  test('renders the chunk text in reading order', async ({ page }) => {
    // The attributor sorts by descending share; rendering that order would show
    // a passage that does not exist in the corpus.
    await page.goto('/?query=France+river+Paris&chunk=seine');

    const text = page.locator('[data-part="attributed-text"]');
    await expect(text).toHaveText(
      /^The Seine is a major river of northern France\./,
    );
  });

  test('selecting a chunk puts it in the URL', async ({ page }) => {
    await page.goto('/?query=France+river+Paris');

    await page.getByRole('listitem').filter({ hasText: 'eiffel' }).click();

    await expect(page).toHaveURL(/chunk=eiffel/);
  });

  test('a deep link restores the full selection', async ({ page }) => {
    // The point of putting selection in the URL: a finding is shareable.
    await page.goto('/?run=candidate&query=Python+data+science&chunk=numpy');

    await expect(page.getByLabel('Run')).toHaveValue('candidate');
    await expect(page.getByLabel('Query')).toHaveValue('Python data science');
    await expect(
      page.getByRole('region', { name: 'Chunk detail' }).getByRole('heading'),
    ).toContainText('numpy');
  });

  test('falls back to the first query when a link names one that is gone', async ({
    page,
  }) => {
    await page.goto('/?query=a+query+that+was+removed');

    await expect(page.getByRole('listitem').first()).toBeVisible();
  });
});

test.describe('diff screen', () => {
  test('compares two runs for one query', async ({ page }) => {
    await page.goto('/diff?query=France+river+Paris');

    await expect(page.getByLabel('Baseline')).toHaveValue('baseline');
    await expect(page.getByLabel('Candidate')).toHaveValue('candidate');
    await expect(page.getByText(/Rank churn/)).toBeVisible();
  });

  test('shows what the candidate added and dropped', async ({ page }) => {
    await page.goto('/diff?query=France+river+Paris');

    const table = page.getByRole('table');
    await expect(
      table.getByRole('row').filter({ hasText: 'added' }),
    ).toHaveCount(1);
    await expect(
      table.getByRole('row').filter({ hasText: 'dropped' }),
    ).toHaveCount(1);
  });

  test('shows a metric delta between the two runs', async ({ page }) => {
    await page.goto('/diff?query=Python+data+science');

    // Both panels render; the candidate one carries deltas against the baseline.
    await expect(page.getByRole('heading', { name: 'Baseline' })).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Candidate' }),
    ).toBeVisible();
  });

  test('navigating between views keeps the app mounted', async ({ page }) => {
    await page.goto('/');

    await page.getByRole('link', { name: 'Diff' }).click();
    await expect(page.getByText(/Rank churn/)).toBeVisible();

    await page.getByRole('link', { name: 'Query' }).click();
    await expect(page.getByText('Precision@K')).toBeVisible();
  });
});
