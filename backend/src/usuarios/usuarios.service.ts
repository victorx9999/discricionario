import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';
import { Brackets, Repository } from 'typeorm';
import { ResultadoPaginado } from '../common/dto';
import { resolverDirecao, resolverOrdenacao } from '../common/utils';
import { AtualizarUsuarioDto, CriarUsuarioDto, ListarUsuariosQueryDto } from './dto';
import { Usuario } from './entities/usuario.entity';

const CAMPOS_ORDENACAO = {
  nome: 'usuario.nome',
  email: 'usuario.email',
  perfil: 'usuario.perfil',
  criadoEm: 'usuario.criado_em',
};

@Injectable()
export class UsuariosService {
  /** Custo do bcrypt — 10 é suficiente para ambiente local. */
  private static readonly ROUNDS = 10;

  constructor(
    @InjectRepository(Usuario)
    private readonly repositorio: Repository<Usuario>,
  ) {}

  async criar(dto: CriarUsuarioDto): Promise<Usuario> {
    const existente = await this.repositorio.findOne({ where: { email: dto.email } });
    if (existente) {
      throw new ConflictException(`Já existe um usuário com o e-mail ${dto.email}`);
    }

    const usuario = this.repositorio.create({
      nome: dto.nome,
      email: dto.email,
      perfil: dto.perfil,
      ativo: dto.ativo ?? true,
      senhaHash: await UsuariosService.gerarHash(dto.senha),
    });

    return this.repositorio.save(usuario);
  }

  async listar(query: ListarUsuariosQueryDto): Promise<ResultadoPaginado<Usuario>> {
    const qb = this.repositorio.createQueryBuilder('usuario');

    if (query.withDeleted) qb.withDeleted();

    if (query.search) {
      qb.andWhere(
        new Brackets((sub) => {
          sub.where('usuario.nome ILIKE :busca', { busca: `%${query.search}%` }).orWhere(
            'usuario.email ILIKE :busca',
            { busca: `%${query.search}%` },
          );
        }),
      );
    }
    if (query.perfil) qb.andWhere('usuario.perfil = :perfil', { perfil: query.perfil });
    if (query.ativo !== undefined) qb.andWhere('usuario.ativo = :ativo', { ativo: query.ativo });

    qb.orderBy(resolverOrdenacao(query.sortBy, CAMPOS_ORDENACAO, 'nome'), resolverDirecao(query.order))
      .skip(query.skip)
      .take(query.take);

    return ResultadoPaginado.de(await qb.getManyAndCount(), query);
  }

  async buscarPorId(id: string): Promise<Usuario> {
    const usuario = await this.repositorio.findOne({ where: { id } });
    if (!usuario) {
      throw new NotFoundException(`Usuário ${id} não encontrado`);
    }
    return usuario;
  }

  /** Busca incluindo o hash da senha — uso exclusivo do fluxo de autenticação. */
  async buscarPorEmailComSenha(email: string): Promise<Usuario | null> {
    return this.repositorio
      .createQueryBuilder('usuario')
      .addSelect('usuario.senhaHash')
      .where('usuario.email = :email', { email: email.toLowerCase() })
      .getOne();
  }

  /** Resolve uma lista de IDs garantindo que todos existam (usado nos responsáveis do grupo). */
  async buscarPorIds(ids: string[]): Promise<Usuario[]> {
    if (!ids.length) return [];
    const unicos = [...new Set(ids)];
    const usuarios = await this.repositorio.find({ where: unicos.map((id) => ({ id })) });

    if (usuarios.length !== unicos.length) {
      const encontrados = new Set(usuarios.map((u) => u.id));
      const faltantes = unicos.filter((id) => !encontrados.has(id));
      throw new NotFoundException(`Usuário(s) não encontrado(s): ${faltantes.join(', ')}`);
    }
    return usuarios;
  }

  async atualizar(id: string, dto: AtualizarUsuarioDto): Promise<Usuario> {
    const usuario = await this.buscarPorId(id);

    if (dto.nome !== undefined) usuario.nome = dto.nome;
    if (dto.perfil !== undefined) usuario.perfil = dto.perfil;
    if (dto.ativo !== undefined) usuario.ativo = dto.ativo;
    if (dto.senha) usuario.senhaHash = await UsuariosService.gerarHash(dto.senha);

    return this.repositorio.save(usuario);
  }

  async registrarAcesso(id: string): Promise<void> {
    await this.repositorio.update({ id }, { ultimoAcessoEm: new Date() });
  }

  static gerarHash(senha: string): Promise<string> {
    return bcrypt.hash(senha, UsuariosService.ROUNDS);
  }

  static conferirSenha(senha: string, hash: string): Promise<boolean> {
    return bcrypt.compare(senha, hash);
  }
}
