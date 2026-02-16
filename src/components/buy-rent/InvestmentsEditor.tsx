import { InvestmentAsset } from "@/lib/buy-rent/types";

interface InvestmentsEditorProps {
  assets: InvestmentAsset[];
  onChange: (next: InvestmentAsset[]) => void;
}

function weightSum(assets: InvestmentAsset[]): number {
  return assets.reduce((sum, asset) => sum + asset.weight, 0);
}

export default function InvestmentsEditor({
  assets,
  onChange,
}: InvestmentsEditorProps) {
  const totalWeight = weightSum(assets);
  const weightError = Math.abs(totalWeight - 100) > 0.01;

  const updateAsset = (id: string, patch: Partial<InvestmentAsset>) => {
    onChange(
      assets.map((asset) =>
        asset.id === id ? { ...asset, ...patch } : asset
      )
    );
  };

  const addAsset = () => {
    const newAsset: InvestmentAsset = {
      id: Math.random().toString(36).slice(2, 9),
      name: "New Asset",
      cagr: 5,
      weight: 0,
    };
    onChange([...assets, newAsset]);
  };

  const removeAsset = (id: string) => {
    onChange(assets.filter((asset) => asset.id !== id));
  };

  return (
    <details className="card">
      <summary className="card-title">
        <h3>Investments</h3>
        <button
          type="button"
          className="ghost"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            addAsset();
          }}
        >
          Add Asset
        </button>
      </summary>
      <div className="card-body">
        <div className="table">
          <div className="table-row table-header">
            <div>Name</div>
            <div>CAGR %</div>
            <div>Weight %</div>
            <div />
          </div>
          {assets.map((asset) => (
            <div key={asset.id} className="table-row">
              <input
                type="text"
                value={asset.name}
                onChange={(event) =>
                  updateAsset(asset.id, { name: event.target.value })
                }
              />
              <input
                type="number"
                value={asset.cagr}
                onChange={(event) =>
                  updateAsset(asset.id, { cagr: Number(event.target.value) })
                }
              />
              <input
                type="number"
                value={asset.weight}
                onChange={(event) =>
                  updateAsset(asset.id, { weight: Number(event.target.value) })
                }
              />
              <button
                type="button"
                className="ghost icon-button"
                aria-label={`Remove ${asset.name}`}
                title="Remove"
                onClick={() => removeAsset(asset.id)}
              >
                &#215;
              </button>
            </div>
          ))}
        </div>
        {weightError && (
          <p className="warning-text">
            Weights sum to {totalWeight.toFixed(2)}%. Adjust to 100%.
          </p>
        )}
      </div>
    </details>
  );
}
