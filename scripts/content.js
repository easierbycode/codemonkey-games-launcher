function addButton() {
  if (document.getElementById('codemonkey-launcher-button')) {
    return; // Button already exists
  }

  const buttonGroup = document.querySelector('.gh-action-menu-group');

  if (buttonGroup) {
    const button = document.createElement('button');
    button.type = 'button';
    button.id = 'codemonkey-launcher-button';
    button.className = 'btn';
    button.innerText = 'Add to CodeMonkey';
    button.style.marginLeft = '8px';

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

    buttonGroup.prepend(button);
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
