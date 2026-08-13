const parameters = new URLSearchParams(window.location.search);
const title = document.querySelector("#callback-title");
const message = document.querySelector("#callback-message");

if (parameters.has("error")) {
  title.textContent = "Authorization was not completed.";
  message.textContent = "Discord returned without granting authorization. No information was stored by this page.";
} else if (parameters.has("code")) {
  title.textContent = "Authorization returned safely.";
  message.textContent = "This public callback received the return request but intentionally does not exchange or store user authorization codes. You can safely return to Discord.";
}

history.replaceState({}, document.title, window.location.pathname);

