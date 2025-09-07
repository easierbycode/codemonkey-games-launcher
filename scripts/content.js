function addButton() {
  // Check if the button already exists to avoid duplicates
  if (document.getElementById('codemonkey-launcher-button')) {
    return;
  }

  // Use a more modern and robust selector for the button group
  const buttonGroup = document.querySelector('.gh-action-menu-group');

  if (buttonGroup) {
    const button = document.createElement('button');
    button.type = 'button';
    button.id = 'codemonkey-launcher-button';
    // Use GitHub's standard classes for buttons in this area
    button.className = 'btn';
    button.innerText = 'Add to CodeMonkey';
    button.style.marginLeft = '8px';

    // Implement the custom protocol handler logic
    button.addEventListener('click', () => {
      const repoUrl = window.location.href;
      const encodedRepoUrl = encodeURIComponent(repoUrl);
      const launcherUrl = `codemonkey://add?repo=${encodedRepoUrl}`;

      // Navigate to the custom protocol handler URL
      window.location.href = launcherUrl;
    });

    // The buttons in this group are not in an <li>, so just prepend the button
    buttonGroup.prepend(button);
  }
}

// GitHub uses dynamic navigation, so we need to observe for changes in the DOM.
// A MutationObserver is the most reliable way to handle this.
const observer = new MutationObserver((mutations) => {
  for (const mutation of mutations) {
    if (mutation.type === 'childList') {
        // We look for the button group on any significant DOM change.
        const buttonGroup = document.querySelector('.gh-action-menu-group');
        if (buttonGroup) {
            addButton();
        }
    }
  }
});

// Start observing the body for child list and subtree changes.
observer.observe(document.body, {
  childList: true,
  subtree: true
});

// Run the function on initial load as well.
addButton();
