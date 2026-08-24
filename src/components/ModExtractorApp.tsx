import { useModExtractor } from '../hooks/useModExtractor';
import { Toast } from './Toast';
import { LandingScreen } from './LandingScreen';
import { ResultsScreen } from './ResultsScreen';

export function ModExtractorApp() {
  const { state, actions, submit, exportModlist, triggerImport } = useModExtractor();

  return (
    <>
      <Toast message={state.toast} />
      {state.screen === 'landing' ? (
        <LandingScreen
          inputValue={state.inputValue}
          loading={state.loading}
          errorMsg={state.errorMsg}
          onInputChange={actions.setInputValue}
          onSubmit={() => void submit()}
          onTriggerImport={triggerImport}
        />
      ) : (
        <ResultsScreen
          state={state}
          actions={actions}
          onSubmit={() => void submit()}
          onExport={exportModlist}
          onTriggerImport={triggerImport}
        />
      )}
    </>
  );
}
