class FakeRequestJson:
    """Replaces supabase._request_json. Matches each call against a queue of
    (method, url_substring, response) rules, consuming the first hit so the
    same endpoint can answer differently across successive calls."""

    def __init__(self, rules):
        self.rules = list(rules)
        self.calls = []

    def __call__(self, method, url, *, headers=None, payload=None):
        self.calls.append({"method": method, "url": url, "payload": payload})
        for i, (rule_method, url_part, response) in enumerate(self.rules):
            if rule_method == method and url_part in url:
                self.rules.pop(i)
                return response
        raise AssertionError(f"Unexpected request: {method} {url}")
