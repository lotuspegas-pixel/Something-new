<?php
/**
 * BabyPhone.online — contactformulier.
 *
 * Ontvangt het formulier van contact.html en mailt het naar info@babyphone.online.
 * Slaat GEEN berichten, namen, e-mailadressen of telefoonnummers op. Het enige
 * dat tijdelijk op schijf staat is een versleutelde (gehashte) vorm van het
 * IP-adres met een tijdstempel, puur om spam te beperken; die vervalt na een uur
 * en is niet herleidbaar tot een persoon.
 */

declare(strict_types=1);

const MAIL_TO       = 'info@babyphone.online';
const MAIL_FROM     = 'noreply@babyphone.online';   // moet op het eigen domein staan
const MAX_NAME      = 100;
const MAX_EMAIL     = 254;
const MAX_PHONE     = 40;
const MAX_MESSAGE   = 20000;
const MIN_SECONDS   = 3;      // sneller ingevuld = vrijwel zeker een bot
const RATE_LIMIT    = 5;      // berichten per IP
const RATE_WINDOW   = 3600;   // per uur

/** Antwoord teruggeven en stoppen. */
function reply(int $status, string $message, bool $ok = false): void
{
    $wantsJson = (isset($_SERVER['HTTP_ACCEPT']) && str_contains($_SERVER['HTTP_ACCEPT'], 'application/json'))
        || (isset($_SERVER['HTTP_X_REQUESTED_WITH']) && $_SERVER['HTTP_X_REQUESTED_WITH'] === 'fetch');

    http_response_code($status);
    if ($wantsJson) {
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode(['ok' => $ok, 'message' => $message], JSON_UNESCAPED_UNICODE);
    } else {
        // Zonder JavaScript: eenvoudige HTML-bevestiging met een weg terug.
        header('Content-Type: text/html; charset=utf-8');
        $safe = htmlspecialchars($message, ENT_QUOTES, 'UTF-8');
        echo '<!doctype html><html lang="en"><head><meta charset="utf-8">'
           . '<meta name="viewport" content="width=device-width,initial-scale=1">'
           . '<title>' . ($ok ? 'Message sent' : 'Could not send') . ' — BabyPhone.online</title>'
           . '<style>body{margin:0;min-height:100vh;display:grid;place-items:center;'
           . 'font:16px/1.6 -apple-system,"Segoe UI",Roboto,Arial,sans-serif;color:#0C2F63;'
           . 'background:linear-gradient(180deg,#FFFFFF,#F5FAFF)}main{max-width:34rem;padding:2rem;text-align:center}'
           . 'a{color:#2F8FF0}</style></head><body><main><h1>'
           . ($ok ? 'Thank you' : 'Sorry') . '</h1><p>' . $safe . '</p>'
           . '<p><a href="contact.html">Back to contact</a></p></main></body></html>';
    }
    exit;
}

/** Voorkomt header-injectie: nieuwe regels horen niet in een naam of adres. */
function oneLine(string $v): string
{
    return trim(preg_replace('/[\r\n\t]+/', ' ', $v) ?? '');
}

/** Eenvoudige, privacyvriendelijke snelheidsbegrenzing. */
function rateLimited(): bool
{
    $ip = $_SERVER['REMOTE_ADDR'] ?? '';
    if ($ip === '') {
        return false;
    }
    // Gehasht met een domeinspecifieke peper: niet terug te rekenen naar een IP.
    $key  = hash('sha256', $ip . '|babyphone.online|contact');
    $file = sys_get_temp_dir() . '/bpo-contact-' . substr($key, 0, 32);
    $now  = time();

    $hits = [];
    if (is_readable($file)) {
        $raw  = (string) file_get_contents($file);
        $hits = array_filter(
            array_map('intval', array_filter(explode(',', $raw), 'strlen')),
            static fn (int $t): bool => $t > $now - RATE_WINDOW
        );
    }
    if (count($hits) >= RATE_LIMIT) {
        return true;
    }
    $hits[] = $now;
    @file_put_contents($file, implode(',', $hits), LOCK_EX);
    return false;
}

// ---------------------------------------------------------------- afhandeling

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    header('Allow: POST');
    reply(405, 'This address only accepts form submissions.');
}

// Honeypot: een veld dat onzichtbaar is voor mensen. Ingevuld = bot.
if (oneLine((string) ($_POST['website'] ?? '')) !== '') {
    // Bewust een succesmelding, zodat een bot niet leert wat er misging.
    reply(200, 'Thank you for your message. We reply within 2 business days.', true);
}

// Te snel ingevuld om echt gelezen te zijn.
$started = (int) ($_POST['started'] ?? 0);
if ($started > 0 && (time() - $started) < MIN_SECONDS) {
    reply(200, 'Thank you for your message. We reply within 2 business days.', true);
}

if (rateLimited()) {
    reply(429, 'Too many messages from this connection. Please try again later, or email info@babyphone.online directly.');
}

$name    = oneLine((string) ($_POST['name'] ?? ''));
$email   = oneLine((string) ($_POST['email'] ?? ''));
$phone   = oneLine((string) ($_POST['phone'] ?? ''));
$message = trim((string) ($_POST['message'] ?? ''));

$errors = [];
if ($name === '' || mb_strlen($name) > MAX_NAME) {
    $errors[] = 'a name (up to ' . MAX_NAME . ' characters)';
}
if ($email === '' || mb_strlen($email) > MAX_EMAIL || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
    $errors[] = 'a valid email address';
}
if ($phone !== '' && (mb_strlen($phone) > MAX_PHONE || !preg_match('/^[0-9+()\/.\s-]+$/', $phone))) {
    $errors[] = 'a valid phone number, or leave it empty';
}
if ($message === '' || mb_strlen($message) > MAX_MESSAGE) {
    $errors[] = 'a message (up to ' . number_format(MAX_MESSAGE) . ' characters)';
}
if ($errors) {
    reply(422, 'Please provide ' . implode(', ', $errors) . '.');
}

$subject = 'Contact form — ' . $name;
$body = "New message from the BabyPhone.online contact form\n"
      . str_repeat('-', 52) . "\n\n"
      . "Name:    {$name}\n"
      . "Email:   {$email}\n"
      . 'Phone:   ' . ($phone !== '' ? $phone : '(not provided)') . "\n"
      . 'Sent:    ' . gmdate('Y-m-d H:i:s') . " UTC\n\n"
      . "Message:\n" . str_repeat('-', 52) . "\n"
      . $message . "\n";

$headers = [
    'From: BabyPhone.online <' . MAIL_FROM . '>',
    'Reply-To: ' . $name . ' <' . $email . '>',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: 8bit',
    'MIME-Version: 1.0',
    'X-Mailer: BabyPhone.online contact form',
];

$sent = @mail(
    MAIL_TO,
    '=?UTF-8?B?' . base64_encode($subject) . '?=',
    $body,
    implode("\r\n", $headers),
    '-f' . MAIL_FROM
);

if (!$sent) {
    reply(500, 'We could not send your message right now. Please email info@babyphone.online directly.');
}

reply(200, 'Thank you for your message. We reply within 2 business days.', true);
