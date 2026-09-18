export interface OpenKnowledgeResult {
  title: string;
  content: string;
  source: string;
  url?: string;
}

const GITHUB_MAX_PAGES = 5;
const GITHUB_PER_PAGE = 10;
const MAX_SOURCE_FILES = 5;


/*
 * =====================================================
 * HTML CLEANER
 * =====================================================
 */

function cleanHtml(
  html: string
): string {

  return html
    .replace(
      /<script[\s\S]*?<\/script>/gi,
      ''
    )
    .replace(
      /<style[\s\S]*?<\/style>/gi,
      ''
    )
    .replace(
      /<noscript[\s\S]*?<\/noscript>/gi,
      ''
    )
    .replace(
      /<[^>]+>/g,
      ' '
    )
    .replace(
      /&nbsp;/gi,
      ' '
    )
    .replace(
      /&amp;/gi,
      '&'
    )
    .replace(
      /&lt;/gi,
      '<'
    )
    .replace(
      /&gt;/gi,
      '>'
    )
    .replace(
      /&quot;/gi,
      '"'
    )
    .replace(
      /&#39;/gi,
      "'"
    )
    .replace(
      /\s+/g,
      ' '
    )
    .trim();
}


/*
 * =====================================================
 * GENERIC FETCH
 * =====================================================
 */

async function fetchText(
  url: string,
  headers: Record<string, string> = {}
): Promise<string> {

  try {

    const response =
      await fetch(
        url,
        {
          headers: {
            'User-Agent':
              'ODX-Mini-Agent/1.0',

            ...headers
          }
        }
      );


    if (!response.ok) {
      return '';
    }


    return await response.text();

  } catch (error) {

    console.error(
      'Open Knowledge fetch error:',
      error
    );

    return '';
  }
}


/*
 * =====================================================
 * GITHUB API
 * =====================================================
 */

async function githubFetch(
  url: string
): Promise<any | null> {

  try {

    const headers: Record<string, string> = {
      'Accept':
        'application/vnd.github+json',

      'User-Agent':
        'ODX-Mini-Agent/1.0',

      'X-GitHub-Api-Version':
        '2026-03-10'
    };


    /*
     * =================================================
     * GITHUB AUTHENTICATION
     * =================================================
     */

    const githubToken =
      process.env.GITHUB_TOKEN?.trim();


    if (githubToken) {

      headers.Authorization =
        `Bearer ${githubToken}`;


      console.log(
        '🔐 GitHub Authentication: ACTIVE'
      );

    } else {

      console.log(
        '⚠️ GitHub Authentication: NOT FOUND'
      );
    }


    /*
     * =================================================
     * REQUEST
     * =================================================
     */

    const response =
      await fetch(
        url,
        {
          headers
        }
      );


    /*
     * =================================================
     * RATE LIMIT
     * =================================================
     */

    if (
      response.status === 403 ||
      response.status === 429
    ) {

      console.log(
        '🛑 GitHub rate limit reached.'
      );


      const remaining =
        response.headers.get(
          'x-ratelimit-remaining'
        );


      const reset =
        response.headers.get(
          'x-ratelimit-reset'
        );


      console.log(
        'GitHub remaining requests:',
        remaining
      );


      if (reset) {

        const resetDate =
          new Date(
            Number(reset) * 1000
          );


        console.log(
          'GitHub rate limit reset:',
          resetDate.toLocaleString()
        );
      }


      return null;
    }


    /*
     * =================================================
     * OTHER API ERROR
     * =================================================
     */

    if (!response.ok) {

      console.log(
        'GitHub API error:',
        response.status
      );

      return null;
    }


    /*
     * =================================================
     * SUCCESS
     * =================================================
     */

    return await response.json();

  } catch (error) {

    console.error(
      'GitHub API error:',
      error
    );

    return null;
  }
}


/*
 * =====================================================
 * GITHUB README
 * =====================================================
 */

async function getGitHubReadme(
  owner: string,
  repo: string
): Promise<string> {

  const url =
    `https://api.github.com/repos/${owner}/${repo}/readme`;


  const data =
    await githubFetch(
      url
    );


  if (
    !data ||
    !data.content
  ) {

    return '';
  }


  try {

    return Buffer
      .from(
        data.content,
        'base64'
      )
      .toString('utf-8')
      .slice(
        0,
        12000
      );

  } catch {

    return '';
  }
}


/*
 * =====================================================
 * SOURCE FILE EXTENSIONS
 * =====================================================
 */

function isUsefulSourceFile(
  path: string
): boolean {

  const lower =
    path.toLowerCase();


  const extensions = [
    '.ts',
    '.tsx',
    '.js',
    '.jsx',
    '.mjs',
    '.cjs',
    '.py',
    '.java',
    '.go',
    '.rs',
    '.php',
    '.css',
    '.scss',
    '.html'
  ];


  return extensions.some(
    extension =>
      lower.endsWith(extension)
  );
}


/*
 * =====================================================
 * SOURCE FILE SEARCH
 * =====================================================
 */

async function getSourceFiles(
  owner: string,
  repo: string
): Promise<string> {

  const url =
    `https://api.github.com/repos/${owner}/${repo}/git/trees/HEAD?recursive=1`;


  const data =
    await githubFetch(
      url
    );


  if (
    !data ||
    !Array.isArray(data.tree)
  ) {

    return '';
  }


  const files =
    data.tree
      .filter(
        (item: any) =>
          item.type === 'blob' &&
          typeof item.path === 'string' &&
          isUsefulSourceFile(
            item.path
          )
      )
      .filter(
        (item: any) => {

          const path =
            item.path.toLowerCase();


          return (
            !path.includes('node_modules/') &&
            !path.includes('dist/') &&
            !path.includes('build/') &&
            !path.includes('.next/') &&
            !path.includes('coverage/') &&
            !path.includes('vendor/')
          );
        }
      )
      .slice(
        0,
        MAX_SOURCE_FILES
      );


  let result = '';


  for (
    const file of files
  ) {

    const rawUrl =
      `https://raw.githubusercontent.com/${owner}/${repo}/HEAD/${file.path}`;


    const content =
      await fetchText(
        rawUrl
      );


    if (!content) {
      continue;
    }


    result +=
      `\n\n===== ${file.path} =====\n\n`;


    result +=
      content.slice(
        0,
        6000
      );
  }


  return result.slice(
    0,
    25000
  );
}


/*
 * =====================================================
 * GITHUB REPOSITORY DATA
 * =====================================================
 */

async function collectRepository(
  repository: any
): Promise<OpenKnowledgeResult | null> {

  if (
    !repository ||
    !repository.owner?.login ||
    !repository.name
  ) {

    return null;
  }


  const owner =
    repository.owner.login;


  const repo =
    repository.name;


  /*
   * README
   */

  const readme =
    await getGitHubReadme(
      owner,
      repo
    );


  /*
   * SOURCE CODE
   */

  const sourceCode =
    await getSourceFiles(
      owner,
      repo
    );


  let content = '';


  if (
    repository.description
  ) {

    content +=
      `Description:\n${repository.description}\n`;
  }


  if (readme) {

    content +=
      `\n\n===== README =====\n\n`;

    content +=
      readme;
  }


  if (sourceCode) {

    content +=
      `\n\n===== SOURCE CODE =====\n\n`;

    content +=
      sourceCode;
  }


  if (!content.trim()) {
    return null;
  }


  return {

    title:
      repository.full_name ||
      repo,

    content:
      content.slice(
        0,
        30000
      ),

    source:
      'GitHub',

    url:
      repository.html_url
  };
}


/*
 * =====================================================
 * GITHUB PAGINATED SEARCH
 * =====================================================
 */

async function searchGitHub(
  query: string
): Promise<OpenKnowledgeResult[]> {

  const results:
    OpenKnowledgeResult[] = [];


  const seenRepositories =
    new Set<string>();


  for (
    let page = 1;
    page <= GITHUB_MAX_PAGES;
    page++
  ) {

    const url =
      `https://api.github.com/search/repositories?q=${encodeURIComponent(
        query
      )}&sort=stars&order=desc&per_page=${GITHUB_PER_PAGE}&page=${page}`;


    console.log(
      `🌐 ODX Open Knowledge: GitHub page ${page}/${GITHUB_MAX_PAGES}`
    );


    const data =
      await githubFetch(
        url
      );


    if (
      !data ||
      !Array.isArray(data.items)
    ) {

      break;
    }


    if (
      data.items.length === 0
    ) {

      break;
    }


    for (
      const repository of data.items
    ) {

      const repositoryId =
        repository.full_name;


      if (
        !repositoryId ||
        seenRepositories.has(
          repositoryId
        )
      ) {

        continue;
      }


      seenRepositories.add(
        repositoryId
      );


      const result =
        await collectRepository(
          repository
        );


      if (result) {

        results.push(
          result
        );
      }


      /*
       * Maximum 20 useful repositories
       */

      if (
        results.length >= 20
      ) {

        return results;
      }
    }
  }


  return results;
}


/*
 * =====================================================
 * MDN
 * =====================================================
 */

async function searchMDN(
  query: string
): Promise<OpenKnowledgeResult[]> {

  const results:
    OpenKnowledgeResult[] = [];


  try {

    const searchUrl =
      `https://developer.mozilla.org/en-US/search?q=${encodeURIComponent(
        query
      )}`;


    const html =
      await fetchText(
        searchUrl
      );


    if (!html) {
      return results;
    }


    const linkRegex =
      /href="(\/en-US\/docs\/[^"]+)"/g;


    const urls =
      new Set<string>();


    let match:
      RegExpExecArray | null;


    while (
      (match =
        linkRegex.exec(html)) !== null
    ) {

      urls.add(
        `https://developer.mozilla.org${match[1]}`
      );


      if (
        urls.size >= 5
      ) {

        break;
      }
    }


    for (
      const url of urls
    ) {

      const page =
        await fetchText(
          url
        );


      const content =
        cleanHtml(
          page
        );


      if (!content) {
        continue;
      }


      results.push({

        title:
          'MDN Web Docs',

        content:
          content.slice(
            0,
            15000
          ),

        source:
          'MDN Web Docs',

        url
      });
    }

  } catch (error) {

    console.error(
      'MDN search error:',
      error
    );
  }


  return results;
}


/*
 * =====================================================
 * STACK OVERFLOW
 * =====================================================
 */

async function searchStackOverflow(
  query: string
): Promise<OpenKnowledgeResult[]> {

  const results:
    OpenKnowledgeResult[] = [];


  try {

    const url =
      `https://api.stackexchange.com/2.3/search/advanced?order=desc&sort=relevance&q=${encodeURIComponent(
        query
      )}&site=stackoverflow&pagesize=5`;


    const data =
      await fetchText(
        url
      );


    if (!data) {
      return results;
    }


    const json =
      JSON.parse(data);


    if (
      !Array.isArray(
        json.items
      )
    ) {

      return results;
    }


    for (
      const item of json.items
    ) {

      results.push({

        title:
          item.title ||
          'Stack Overflow',

        content:
          `Question: ${item.title}`,

        source:
          'Stack Overflow',

        url:
          item.link
      });
    }

  } catch (error) {

    console.error(
      'Stack Overflow search error:',
      error
    );
  }


  return results;
}


/*
 * =====================================================
 * MAIN SEARCH
 * =====================================================
 */

export async function searchOpenKnowledge(
  query: string
): Promise<OpenKnowledgeResult[]> {

  console.log(
    '🌐 ODX Open Knowledge search:',
    query
  );


  const results:
    OpenKnowledgeResult[] = [];


  const lowerQuery =
    query.toLowerCase();


  /*
   * ===================================================
   * MDN
   * ===================================================
   */

  if (
    lowerQuery.includes('javascript') ||
    lowerQuery.includes('typescript') ||
    lowerQuery.includes('react') ||
    lowerQuery.includes('next') ||
    lowerQuery.includes('html') ||
    lowerQuery.includes('css') ||
    lowerQuery.includes('web')
  ) {

    const mdn =
      await searchMDN(
        query
      );


    results.push(
      ...mdn
    );
  }


  /*
   * ===================================================
   * GITHUB
   * ===================================================
   */

  const github =
    await searchGitHub(
      query
    );


  results.push(
    ...github
  );


  /*
   * ===================================================
   * STACK OVERFLOW
   * ===================================================
   */

  const stackOverflow =
    await searchStackOverflow(
      query
    );


  results.push(
    ...stackOverflow
  );


  /*
   * ===================================================
   * DUPLICATE REMOVE
   * ===================================================
   */

  const unique =
    new Map<
      string,
      OpenKnowledgeResult
    >();


  for (
    const item of results
  ) {

    const key =
      item.url ||
      `${item.source}-${item.title}`;


    if (
      !unique.has(key)
    ) {

      unique.set(
        key,
        item
      );
    }
  }


  const finalResults =
    Array.from(
      unique.values()
    );


  console.log(
    `🌐 Open Knowledge: ${finalResults.length} sources collected.`
  );


  return finalResults;
}