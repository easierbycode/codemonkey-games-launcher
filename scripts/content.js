function addButton() {
  if (document.getElementById('codemonkey-launcher-button')) {
    return; // Button already exists
  }

  // Try multiple selectors for different GitHub layouts
  const buttonGroup = document.querySelector('.gh-action-menu-group') ||
                      document.querySelector('[data-testid="repository-actions"]') ||
                      document.querySelector('.d-flex.gap-2') ||
                      document.querySelector('div.d-flex > span.d-none.d-md-flex');

  if (buttonGroup) {
    const button = document.createElement('button');
    button.type = 'button';
    button.id = 'codemonkey-launcher-button';
    button.className = 'btn btn-sm';
    button.innerText = 'Add to CodeMonkey';
    button.style.marginLeft = '8px';
    button.style.backgroundColor = '#2da44e';
    button.style.color = 'white';
    button.style.border = '1px solid rgba(27,31,36,0.15)';
    button.style.borderRadius = '6px';
    button.style.padding = '5px 16px';
    button.style.cursor = 'pointer';

    button.addEventListener('click', () => {
      const repoUrl = window.location.href;

      const branch = window.prompt("Enter the branch name (e.g., main, master):", "main");
      if (branch === null) return; // User cancelled

      const folder = window.prompt("Enter the folder path (e.g., docs, dist), or leave empty for root:", "");
      if (folder === null) return; // User cancelled

      const encodedRepo = encodeURIComponent(repoUrl);
      const encodedBranch = encodeURIComponent(branch);
      const encodedFolder = encodeURIComponent(folder);

      const launcherUrl = `codemonkey://add?repo=${encodedRepo}&branch=${encodedBranch}&folder=${encodedFolder}`;

      window.location.href = launcherUrl;
    });

    buttonGroup.appendChild(button);
  } else {
    // Fallback: add to the repository header
    const repoHeader = document.querySelector('#repository-container-header') ||
                       document.querySelector('div[data-hpc] > div > div');
    if (repoHeader) {
      const button = document.createElement('button');
      button.type = 'button';
      button.id = 'codemonkey-launcher-button';
      button.innerText = '🐵 Add to CodeMonkey';
      button.style.position = 'fixed';
      button.style.top = '10px';
      button.style.right = '10px';
      button.style.zIndex = '9999';
      button.style.backgroundColor = '#2da44e';
      button.style.color = 'white';
      button.style.border = '1px solid rgba(27,31,36,0.15)';
      button.style.borderRadius = '6px';
      button.style.padding = '8px 16px';
      button.style.cursor = 'pointer';
      button.style.fontSize = '14px';
      button.style.fontWeight = '500';

      button.addEventListener('click', () => {
        const repoUrl = window.location.href;

        const branch = window.prompt("Enter the branch name (e.g., main, master):", "main");
        if (branch === null) return;

        const folder = window.prompt("Enter the folder path (e.g., docs, dist), or leave empty for root:", "");
        if (folder === null) return;

        const encodedRepo = encodeURIComponent(repoUrl);
        const encodedBranch = encodeURIComponent(branch);
        const encodedFolder = encodeURIComponent(folder);

        const launcherUrl = `codemonkey://add?repo=${encodedRepo}&branch=${encodedBranch}&folder=${encodedFolder}`;

        window.location.href = launcherUrl;
      });

      document.body.appendChild(button);
    }
  }
}

const observer = new MutationObserver(() => {
  // On any significant DOM change, try to add the button.
  // The addButton function is idempotent, so this is safe.
  addButton();
});

observer.observe(document.body, {
  childList: true,
  subtree: true,
});

// Also run on initial load
addButton();