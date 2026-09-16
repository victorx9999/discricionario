import { Brackets, SelectQueryBuilder } from 'typeorm';
import { PapelResponsavel, PerfilUsuario } from '../common/enums';
import { UsuarioAutenticado } from './decorators';

/**
 * Regra de visibilidade da seção 2.
 *
 *   Admin        — enxerga tudo.
 *   Atendimento  — os comitês que criou e aqueles em que é backup.
 *   Consultoria  — apenas os comitês em que consta como responsável.
 *
 * É aplicada no banco, via EXISTS sobre `comite_responsaveis`, e não em
 * memória: um usuário nunca recebe a linha que não pode ver, nem no total
 * da paginação.
 */
export function aplicarVisibilidadeComite<T extends object>(
  qb: SelectQueryBuilder<T>,
  aliasComite: string,
  usuario: UsuarioAutenticado,
): SelectQueryBuilder<T> {
  if (usuario.perfil === PerfilUsuario.ADMIN) return qb;

  const papeis =
    usuario.perfil === PerfilUsuario.ATENDIMENTO
      ? [PapelResponsavel.BACKUP, PapelResponsavel.CRIADOR, PapelResponsavel.CONSULTORIA]
      : [PapelResponsavel.CONSULTORIA];

  qb.andWhere(
    new Brackets((sub) => {
      sub.where(
        `EXISTS (
          SELECT 1 FROM comite_responsaveis cr
          WHERE cr.comite_id = ${aliasComite}.id
            AND cr.usuario_id = :visibilidadeUsuarioId
            AND cr.papel IN (:...visibilidadePapeis)
        )`,
        { visibilidadeUsuarioId: usuario.id, visibilidadePapeis: papeis },
      );

      // O Atendimento também enxerga o que criou, mesmo sem vínculo explícito.
      if (usuario.perfil === PerfilUsuario.ATENDIMENTO) {
        sub.orWhere(`${aliasComite}.criado_por_id = :visibilidadeUsuarioId`, {
          visibilidadeUsuarioId: usuario.id,
        });
      }
    }),
  );

  return qb;
}

/**
 * Mesma regra aplicada a uma consulta que parte do participante.
 * Participantes sem comitê ficam visíveis apenas para Admin e Atendimento —
 * são os "elegíveis sem grupo" da tela de consolidação.
 */
export function aplicarVisibilidadeParticipante<T extends object>(
  qb: SelectQueryBuilder<T>,
  aliasParticipante: string,
  usuario: UsuarioAutenticado,
): SelectQueryBuilder<T> {
  if (usuario.perfil === PerfilUsuario.ADMIN) return qb;

  const papeis =
    usuario.perfil === PerfilUsuario.ATENDIMENTO
      ? [PapelResponsavel.BACKUP, PapelResponsavel.CRIADOR, PapelResponsavel.CONSULTORIA]
      : [PapelResponsavel.CONSULTORIA];

  qb.andWhere(
    new Brackets((sub) => {
      sub.where(
        `EXISTS (
          SELECT 1 FROM comite_responsaveis cr
          WHERE cr.comite_id = ${aliasParticipante}.comite_id
            AND cr.usuario_id = :visibilidadeUsuarioId
            AND cr.papel IN (:...visibilidadePapeis)
        )`,
        { visibilidadeUsuarioId: usuario.id, visibilidadePapeis: papeis },
      );

      if (usuario.perfil === PerfilUsuario.ATENDIMENTO) {
        sub.orWhere(
          `EXISTS (
            SELECT 1 FROM comites c
            WHERE c.id = ${aliasParticipante}.comite_id
              AND c.criado_por_id = :visibilidadeUsuarioId
          )`,
          { visibilidadeUsuarioId: usuario.id },
        );
        // Elegíveis ainda sem comitê fazem parte do trabalho do Atendimento.
        sub.orWhere(`${aliasParticipante}.comite_id IS NULL`);
      }
    }),
  );

  return qb;
}

/** Verdadeiro quando o usuário pode ver/editar o comitê informado. */
export function podeAcessarComite(
  usuario: UsuarioAutenticado,
  comite: { criadoPorId?: string | null; responsaveis?: Array<{ usuarioId: string; papel: PapelResponsavel }> },
): boolean {
  if (usuario.perfil === PerfilUsuario.ADMIN) return true;

  if (usuario.perfil === PerfilUsuario.ATENDIMENTO && comite.criadoPorId === usuario.id) {
    return true;
  }

  const papeis =
    usuario.perfil === PerfilUsuario.ATENDIMENTO
      ? [PapelResponsavel.BACKUP, PapelResponsavel.CRIADOR, PapelResponsavel.CONSULTORIA]
      : [PapelResponsavel.CONSULTORIA];

  return (comite.responsaveis ?? []).some(
    (responsavel) => responsavel.usuarioId === usuario.id && papeis.includes(responsavel.papel),
  );
}
