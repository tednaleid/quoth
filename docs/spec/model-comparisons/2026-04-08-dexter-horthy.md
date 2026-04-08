# Model Bench: 1-800-BAD-CODE/punctuation_fullstop_truecase_english

Fixture: dexter-horthy (6051 words, 26:42)

## Metrics

| Metric | Value |
|--------|-------|
| Load time | 0.2s |
| Inference time | 0.5s |
| Per-word | 0.09ms |

## Notes

- ~45 MB model, SentencePiece tokenizer
- Punctuation + true-casing + sentence boundaries

## Sample output

### Raw

```
All right. Before I bring up Dex, I gotta say I met James. And James Yeah. Can you stand up real fast? James told me this morning that he is going We can't see the QR code. You got to hit it up. He's going to be having dinner tonight and everybody's invited. So, if you want to go, just scan that QR code real fast and go hang out with James. That's awesome. And that's what we're going for here. That is great. >> Yeah, you rock. Yeah, that's I like it. I like it, too. Okay, so I'm gonna bring up D
```

### Formatted

```
All, Right before I bring up Dex? I gotta say I met James and James? Yeah? can you stand up real fast James told me this morning that he is going, We cant see the QR code, You got to hit it up? Hes going to be having dinner tonight and everybodys invited, So if you want to go? just scan that QR code real fast and go hang out with James? thats awesome and thats what were going for here? that is great, >> Yeah? you rock, Yeah? Thats I like it, I like it too, Okay? So Im gonna bring up dex? uh, Ear
```

---

# Model Bench: oliverguhr/fullstop-punctuation-multilingual-base (q8)

Fixture: dexter-horthy (6051 words, 26:42)

## Metrics

| Metric | Value |
|--------|-------|
| Load time | 0.5s |
| Inference time | 0.9s |
| Per-word | 0.14ms |

## Notes

- ~265 MB quantized (from ~1 GB fp32)
- Punctuation only (no true-casing)
- XLM-RoBERTa base, trained on diverse text including spoken

## Sample output

### Raw

```
All right. Before I bring up Dex, I gotta say I met James. And James Yeah. Can you stand up real fast? James told me this morning that he is going We can't see the QR code. You got to hit it up. He's going to be having dinner tonight and everybody's invited. So, if you want to go, just scan that QR code real fast and go hang out with James. That's awesome. And that's what we're going for here. That is great. >> Yeah, you rock. Yeah, that's I like it. I like it, too. Okay, so I'm gonna bring up D
```

### Formatted

```
all right. before i bring up dex, i gotta say i met james and james. yeah, can you stand up real fast? james told me this morning that he is going. we cant see the qr code. you got to hit it up. hes going to be having dinner tonight and everybodys invited. so if you want to go, just scan that qr code real fast and go hang out with james. thats awesome and thats what were going for here. that is great. >> yeah, you rock yeah thats i like it. i like it too. okay, so im gonna bring up dex. uh, earl
```
