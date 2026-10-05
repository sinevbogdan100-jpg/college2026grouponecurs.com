# Project requirements

- Every user-facing change, including the smallest fix, must work in Russian and Kazakh simultaneously. Treat both languages as part of the initial implementation, not a later task.
- Translate all new labels, buttons, messages, statuses, release descriptions and accessibility labels. Use the selected interface language. Preserve people's names and stored personal data.
- Apply feature and layout changes to the website and installed PWA, on phones and computers. Account for the length of both languages in responsive layouts.
- Verify both RU and KZ behavior before publishing. Changing language must also update any open new interface.
- Release descriptions are always bilingual: each Russian point is followed by its Kazakh translation, regardless of the selected interface language. Other controls follow the selected language.
- Release history includes both fixes and new features. Mark fixes separately. The only update levels are «Мини-обновление», «Среднее обновление», and «Крупное обновление», with Kazakh equivalents. Do not add creative release nicknames.
- Keep site build metadata, asset versions and service-worker cache versions consistent when shipping a release.
- Do not change teachers or personal names as part of unrelated UI work.
