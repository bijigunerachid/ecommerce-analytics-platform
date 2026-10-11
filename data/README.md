# data/

`samples/catalog.json` is the fictional product catalog (plus name and city lists) used by the
sample data generator (`npm run generate-data` in `backend/`).

Only **synthetic** sample data lives here, under `data/samples/`. Everything else in this
folder is git-ignored (generated datasets, local exports, Parquet output).

Never place real customer, payment, or personal information in this repository.
