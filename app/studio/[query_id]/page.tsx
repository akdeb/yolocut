import { StudioEditorClient } from "./StudioEditorClient";

type StudioPageProps = {
  params: Promise<{ query_id: string }>;
};

const StudioPage = async ({ params }: StudioPageProps) => {
  const { query_id } = await params;

  return <StudioEditorClient queryId={query_id} />;
};

export default StudioPage;
