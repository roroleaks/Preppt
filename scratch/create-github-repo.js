const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');

const { execSync } = require('child_process');
const path = require('path');

const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || execSync('gh auth token').toString().trim();
const repoName = 'Preppt';
const repoDescription = 'Preppt — Scientific Literature to Presentation Specification Generator. Powered by Europe PMC and Semantic Scholar dual retrieval, multi-factor relevance ranking, and publication-grade Word (.docx) export.';

async function createAndPushRepo() {
  console.log(`Checking if repository "${repoName}" already exists on account roroleaks...`);

  const checkRes = await fetch(`https://api.github.com/repos/roroleaks/${repoName}`, {
    headers: {
      'Authorization': `token ${token}`,
      'User-Agent': 'Preppt-Agent'
    }
  });

  if (checkRes.status === 200) {
    const existing = await checkRes.json();
    console.log(`REPOSITORY EXISTS: https://github.com/${existing.full_name}`);
    return existing;
  }

  if (checkRes.status === 404) {
    console.log(`Name "${repoName}" is completely available! Creating repository now...`);
    
    const createRes = await fetch('https://api.github.com/user/repos', {
      method: 'POST',
      headers: {
        'Authorization': `token ${token}`,
        'Content-Type': 'application/json',
        'User-Agent': 'Preppt-Agent'
      },
      body: JSON.stringify({
        name: repoName,
        description: repoDescription,
        private: false,
        has_issues: true,
        has_projects: false,
        has_wiki: false
      })
    });

    const createData = await createRes.json();
    if (!createRes.ok) {
      throw new Error(`Failed to create repository: ${createData.message || createRes.statusText}`);
    }

    console.log(`✓ Repository created successfully! URL: ${createData.html_url}`);
    return createData;
  }

  throw new Error(`Unexpected status check: HTTP ${checkRes.status}`);
}

createAndPushRepo().then(repo => {
  console.log('Repository ready. Target clone URL:', repo.clone_url);
}).catch(err => {
  console.error('Error creating repository:', err);
  process.exit(1);
});
