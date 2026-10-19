// Settings menu entries that open external pages (same as the other Dorman Lakely modules)

function linkApp({ id, title, icon, prompt, label, url }) {
  return class extends foundry.applications.api.ApplicationV2 {
    static DEFAULT_OPTIONS = {
      id,
      tag: "div",
      window: { title, icon },
      position: { width: 1, height: 1 },
    };

    async _renderHTML() {
      return document.createElement("div");
    }

    _replaceHTML(result, content) {
      content.replaceChildren(result);
    }

    async _onFirstRender() {
      this.element.style.display = "none";
      await foundry.applications.api.DialogV2.prompt({
        window: { title },
        content: `<p>${prompt}</p>`,
        ok: {
          label: `<i class="${icon}"></i> ${label}`,
          callback: () => window.open(url, "_blank", "noopener,noreferrer"),
        },
      });
      this.close();
    }
  };
}

export const PatreonLink = linkApp({
  id: "dlcp-patreon-link",
  title: "Support on Patreon",
  icon: "fab fa-patreon",
  prompt: "Open the Patreon page in a new tab.",
  label: "Visit Patreon",
  url: "https://www.patreon.com/c/DormanLakely",
});

export const DmGuruLink = linkApp({
  id: "dlcp-dmguru-link",
  title: "Dungeon Master Guru",
  icon: "fas fa-dragon",
  prompt: "Open the Dungeon Master Guru site in a new tab.",
  label: "Visit Dungeon Master Guru",
  url: "https://dungeonmaster.guru",
});
