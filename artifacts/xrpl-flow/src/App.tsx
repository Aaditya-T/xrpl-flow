import { useEffect } from 'react';
import { WorkflowCanvas } from './components/WorkflowCanvas';

export default function App() {
  useEffect(() => {
    document.documentElement.classList.add('dark');
  }, []);

  return <WorkflowCanvas />;
}
