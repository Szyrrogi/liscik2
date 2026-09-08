# Liściki — listy życzeń dla znajomych

Aplikacja webowa (PWA), którą można zainstalować na telefonie z Androidem
z poziomu przeglądarki — bez Google Play. Działa na koncie Firebase,
które sam założysz za darmo.

## Co robi aplikacja

- Konta użytkowników (rejestracja / logowanie e-mailem i hasłem)
- Dodawanie znajomych przez zaproszenie na e-mail (trzeba zaakceptować)
- Każdy prowadzi własną listę życzeń ("forum")
- Znajomi mogą oznaczyć prezent jako "Ja to kupię!" — to widzą wszyscy
  odwiedzający listę **poza jej właścicielem**. Właściciel nigdy — nawet
  patrząc w bazę danych z poziomu aplikacji — nie zobaczy, kto i czy w ogóle
  coś zarezerwował. To wymuszają reguły bezpieczeństwa Firestore, nie tylko
  interfejs.

## Krok 1 — załóż projekt Firebase (5–10 minut)

1. Wejdź na https://console.firebase.google.com i kliknij **Dodaj projekt**.
2. Nadaj nazwę (np. "liisciki"), możesz wyłączyć Google Analytics.
3. W panelu projektu kliknij ikonę **`</>`** (Dodaj aplikację → Web),
   nadaj jej nazwę i zarejestruj. Firebase pokaże Ci obiekt konfiguracyjny
   `firebaseConfig` — skopiuj go.
4. Otwórz plik `firebase-config.js` w tym projekcie i wklej skopiowane
   wartości w miejsce `"TU-WKLEJ-..."`.

## Krok 2 — włącz logowanie e-mailem

1. W konsoli Firebase: **Build → Authentication → Get started**.
2. Zakładka **Sign-in method** → włącz dostawcę **Email/Password**.

## Krok 3 — włącz bazę danych i wgraj reguły

1. **Build → Firestore Database → Create database** (wybierz dowolny region,
   tryb produkcyjny).
2. Zakładka **Rules** — zamień całą zawartość na treść pliku
   `firestore.rules` z tego projektu i kliknij **Publish**.
   To właśnie te reguły pilnują, żeby właściciel listy nie mógł zobaczyć,
   kto rezerwuje jego prezenty.

## Krok 4 — wystaw aplikację w internecie

Aplikacja to zwykłe pliki statyczne (`index.html`, `style.css`, `app.js`...),
więc możesz je wystawić gdziekolwiek. Najprościej przez Firebase Hosting:

```bash
npm install -g firebase-tools
firebase login
firebase init hosting     # jako katalog publiczny wskaż folder z tymi plikami
firebase deploy
```

Po chwili dostaniesz adres w stylu `https://twoj-projekt.web.app` —
to jest link do Twojej aplikacji.

(Alternatywy: GitHub Pages, Netlify, Vercel — wystarczy, że hostują pliki
statyczne po HTTPS; PWA wymaga HTTPS, żeby dało się je zainstalować.)

## Krok 5 — zainstaluj na telefonie z Androidem

1. Otwórz swój adres (np. `https://twoj-projekt.web.app`) w Chrome na
   telefonie.
2. Chrome pokaże baner **"Dodaj do ekranu głównego"** / **"Zainstaluj
   aplikację"** — albo zrób to ręcznie z menu (⋮) → **Zainstaluj aplikację**.
3. Ikona pojawi się na ekranie głównym i będzie działać jak zwykła appka
   (pełny ekran, własna ikona, działa też częściowo offline).

## Struktura danych (Firestore)

```
users/{uid}            { displayName, email, friends: [uid, uid, ...] }
friendRequests/{id}    { from, to, status: pending|accepted|declined }
wishes/{id}            { ownerId, title, description, createdAt }
wishes/{id}/reservation/info   { reservedBy, reservedByName }
```

`reservation` to osobna podkolekcja — dzięki temu reguły Firestore mogą
zablokować odczyt tylko dla właściciela życzenia, a jednocześnie pozwolić
na odczyt i zapis wszystkim jego znajomym.

## Pomysły na rozwój

- Powiadomienia push, gdy ktoś zaakceptuje zaproszenie
- Możliwość dodania linku do produktu i podglądu zdjęcia
- Grupowe rezerwacje ("zrzutka" na jeden prezent)
- Publikacja w Google Play jako Trusted Web Activity (np. przez narzędzie
  Bubblewrap od Google) — to opakowuje gotowe PWA w prawdziwy plik `.apk`
  bez przepisywania kodu

## Ograniczenia obecnej wersji

- Reset hasła / logowanie przez Google nie jest jeszcze podpięte
  (Firebase to umożliwia, wystarczy dodać kolejnego dostawcę logowania)
- Brak usuwania konta z poziomu appki
- Wyszukiwanie znajomych działa tylko po dokładnym adresie e-mail
